// seed-demo.js — Llena la base con ventas de ejemplo de los últimos 45 días
// para que el dashboard de administrador tenga estadísticas que mostrar.
//   npm run seed:demo
// Es repetible: borra los pedidos demo anteriores (clientes @demo.fitstock) y los recrea.
import { db } from '../src/db.js';
import { hashPassword } from '../src/password.js';

const DIAS = 45;
const CLIENTES = [
  ['Ana Torres', 'ana@demo.fitstock'], ['Luis Ramírez', 'luis@demo.fitstock'],
  ['Sofía Hernández', 'sofia@demo.fitstock'], ['Diego Morales', 'diego@demo.fitstock'],
  ['Valeria Núñez', 'valeria@demo.fitstock'], ['Carlos Ortega', 'carlos@demo.fitstock'],
  ['Mariana López', 'mariana@demo.fitstock'], ['Jorge Salas', 'jorge@demo.fitstock'],
];
const CIUDADES = [['Zapopan', 'Jalisco', '45010'], ['Guadalajara', 'Jalisco', '44100'], ['Tlaquepaque', 'Jalisco', '45500'], ['Monterrey', 'Nuevo León', '64000'], ['CDMX', 'Ciudad de México', '06600']];
const METODOS = ['tarjeta', 'tarjeta', 'paypal', 'paypal', 'mercadopago', 'mercadopago', 'mercadopago', 'transferencia'];

let semilla = 20260101; // aleatorio reproducible: siempre salen los mismos datos
const azar = () => ((semilla = (semilla * 1664525 + 1013904223) % 4294967296) / 4294967296);
const entre = (a, b) => a + Math.floor(azar() * (b - a + 1));
const elegir = (arr) => arr[Math.floor(azar() * arr.length)];

const sqlFecha = (d) => d.toISOString().slice(0, 19).replace('T', ' ');

await db.run("DELETE FROM pedido WHERE usuario_id IN (SELECT id FROM usuario WHERE email LIKE '%@demo.fitstock')");
await db.run("DELETE FROM direccion WHERE id NOT IN (SELECT direccion_id FROM pedido)");

const ids = [];
for (const [nombre, email] of CLIENTES) {
  const ya = await db.get('SELECT id FROM usuario WHERE email = ?', email);
  if (ya) { ids.push({ id: Number(ya.id), nombre, email }); continue; }
  const r = await db.run('INSERT INTO usuario (nombre, email, password_hash) VALUES (?, ?, ?)', nombre, email, hashPassword('Demo1234'));
  ids.push({ id: r.lastInsertRowid, nombre, email });
}

const productos = await db.all('SELECT id, precio FROM producto');
let creados = 0;

for (let d = DIAS - 1; d >= 0; d--) {
  // Más ventas conforme se acerca a hoy y fines de semana un poco más altos
  const base = 1 + Math.round(((DIAS - d) / DIAS) * 2);
  const pedidosDelDia = entre(0, base + 1);
  for (let i = 0; i < pedidosDelDia; i++) {
    const cliente = elegir(ids);
    const fecha = new Date(Date.now() - d * 86400000);
    fecha.setUTCHours(entre(15, 28) % 24, entre(0, 59), entre(0, 59)); // horario de tienda (UTC)
    const lineas = [];
    for (let k = entre(1, 3); k > 0; k--) {
      const p = elegir(productos);
      if (!lineas.find((l) => l.p.id === p.id)) lineas.push({ p, cantidad: entre(1, 3) });
    }
    const subtotal = lineas.reduce((a, l) => a + l.p.precio * l.cantidad, 0);
    const envio = subtotal >= 999 ? 0 : 99;
    const metodo = elegir(METODOS);

    // Estado realista: los viejos ya se entregaron; transferencias recientes siguen pendientes.
    let estado = d > 10 ? 'entregado' : d > 4 ? elegir(['enviado', 'entregado']) : 'procesando';
    let estadoPago = 'pagado';
    if (metodo === 'transferencia' && d < 6) estadoPago = 'pendiente';
    if (azar() < 0.06) { estado = 'cancelado'; estadoPago = metodo === 'tarjeta' ? 'pagado' : 'cancelado'; }

    const [ciudad, estadoMx, cp] = elegir(CIUDADES);
    const dir = await db.run(
      'INSERT INTO direccion (calle, numero, ciudad, estado, cp, pais, telefono) VALUES (?, ?, ?, ?, ?, ?, ?)',
      'Av. Demo', String(entre(1, 999)), ciudad, estadoMx, cp, 'México', `33${entre(10000000, 99999999)}`
    );
    const ped = await db.run(
      `INSERT INTO pedido (usuario_id, direccion_id, nombre_contacto, email_contacto, metodo_pago, subtotal, envio, total,
                           estado, fecha_creacion, estado_pago, referencia_pago, fecha_pago)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      cliente.id, dir.lastInsertRowid, cliente.nombre, cliente.email, metodo, subtotal, envio, subtotal + envio,
      estado, sqlFecha(fecha), estadoPago,
      estadoPago === 'pagado' ? `DEMO-${metodo.toUpperCase()}-${creados + 1}` : null,
      estadoPago === 'pagado' ? sqlFecha(fecha) : null
    );
    for (const l of lineas) {
      await db.run(
        'INSERT INTO pedido_detalle (pedido_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?)',
        ped.lastInsertRowid, l.p.id, l.cantidad, l.p.precio, l.p.precio * l.cantidad
      );
    }
    creados++;
  }
}

// Para que el widget de "stock bajo" tenga algo que mostrar en la demo.
await db.run("UPDATE producto SET stock = 4 WHERE nombre LIKE 'Pre-entreno%'");
await db.run("UPDATE producto SET stock = 7 WHERE nombre LIKE 'Cinturón%'");
await db.run("UPDATE producto SET stock = 9 WHERE nombre LIKE 'Creatina%'");

console.log(`✅ ${creados} pedidos demo creados en los últimos ${DIAS} días (${ids.length} clientes @demo.fitstock, contraseña Demo1234).`);
process.exit(0);
