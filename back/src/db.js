// db.js — Base de datos libSQL (SQLite). Funciona igual con un archivo
// local (para desarrollo/demo) o con Turso (SQLite en la nube), según las
// variables de entorno TURSO_DATABASE_URL / TURSO_AUTH_TOKEN.
//
// Este archivo vive en el BACKEND, separado de Astro: es el único lugar
// del proyecto que toca la base de datos directamente.
import { createClient } from '@libsql/client';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from './password.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.join(__dirname, '..', 'db.sql');

const url = process.env.TURSO_DATABASE_URL || 'file:data/fitstock.sqlite';
const authToken = process.env.TURSO_AUTH_TOKEN;

if (url.startsWith('file:')) {
  fs.mkdirSync(path.join(__dirname, '..', 'data'), { recursive: true });
}

export const client = createClient({ url, authToken });

const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf-8');

// Migración para bases de datos creadas ANTES de los métodos de cobro:
// SQLite no permite modificar un CHECK, así que se reconstruye la tabla
// `pedido` (procedimiento oficial: crear nueva, copiar, borrar, renombrar)
// para aceptar 'mercadopago' y agregar estado_pago / referencia_pago / fecha_pago.
// Los pedidos anteriores se conservan; los no cancelados se marcan como pagados.
async function migrarPedidoConMetodosDeCobro() {
  const columnas = await client.execute('PRAGMA table_info(pedido)');
  if (columnas.rows.some((c) => c.name === 'estado_pago')) return;

  console.log('🔧 Migrando tabla pedido (métodos de cobro: PayPal + Mercado Pago)...');
  await client.executeMultiple(`
    PRAGMA foreign_keys = OFF;
    BEGIN;
    CREATE TABLE pedido_nuevo (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id      INTEGER,
      direccion_id    INTEGER NOT NULL,
      nombre_contacto TEXT NOT NULL,
      email_contacto  TEXT NOT NULL,
      metodo_pago     TEXT NOT NULL CHECK (metodo_pago IN ('tarjeta', 'paypal', 'mercadopago', 'transferencia')),
      subtotal        REAL NOT NULL,
      envio           REAL NOT NULL DEFAULT 0,
      total           REAL NOT NULL,
      estado          TEXT NOT NULL DEFAULT 'procesando'
                      CHECK (estado IN ('procesando', 'enviado', 'entregado', 'cancelado')),
      fecha_creacion  TEXT NOT NULL DEFAULT (datetime('now')),
      estado_pago     TEXT NOT NULL DEFAULT 'pendiente'
                      CHECK (estado_pago IN ('pendiente', 'pagado', 'cancelado')),
      referencia_pago TEXT,
      fecha_pago      TEXT,
      FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE SET NULL,
      FOREIGN KEY (direccion_id) REFERENCES direccion(id) ON DELETE RESTRICT
    );
    INSERT INTO pedido_nuevo
      (id, usuario_id, direccion_id, nombre_contacto, email_contacto, metodo_pago,
       subtotal, envio, total, estado, fecha_creacion, estado_pago, fecha_pago)
    SELECT id, usuario_id, direccion_id, nombre_contacto, email_contacto, metodo_pago,
           subtotal, envio, total, estado, fecha_creacion,
           CASE WHEN estado = 'cancelado' THEN 'cancelado' ELSE 'pagado' END,
           CASE WHEN estado = 'cancelado' THEN NULL ELSE fecha_creacion END
      FROM pedido;
    DROP TABLE pedido;
    ALTER TABLE pedido_nuevo RENAME TO pedido;
    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}

// BackOffice (ERP): tablas y columna nuevas. Es idempotente, así que corre en cada
// arranque: crea lo que falte en bases que ya existían (incluida la de Turso) sin tocar datos.
async function migrarBackoffice() {
  const columnas = await client.execute('PRAGMA table_info(usuario)');
  if (!columnas.rows.some((c) => c.name === 'activo')) {
    console.log('🔧 Migrando tabla usuario (BackOffice: columna activo)...');
    await client.execute('ALTER TABLE usuario ADD COLUMN activo INTEGER NOT NULL DEFAULT 1');
  }
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS movimiento_inventario (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      producto_id      INTEGER NOT NULL,
      tipo             TEXT NOT NULL CHECK (tipo IN ('inicial', 'entrada', 'salida', 'ajuste', 'venta', 'devolucion')),
      cantidad         INTEGER NOT NULL,
      stock_resultante INTEGER NOT NULL,
      motivo           TEXT,
      usuario_id       INTEGER,
      pedido_id        INTEGER,
      fecha            TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (producto_id) REFERENCES producto(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_mov_producto ON movimiento_inventario(producto_id, id);
    CREATE TABLE IF NOT EXISTS bitacora (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      accion      TEXT NOT NULL,
      entidad     TEXT NOT NULL,
      entidad_id  INTEGER,
      mensaje     TEXT NOT NULL,
      usuario_id  INTEGER,
      usuario     TEXT,
      fecha       TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_bitacora_fecha ON bitacora(id DESC);
  `);
  // Kardex: cada producto arranca con un movimiento "inicial" igual a su stock actual.
  await client.execute(`
    INSERT INTO movimiento_inventario (producto_id, tipo, cantidad, stock_resultante, motivo)
    SELECT id, 'inicial', stock, stock, 'Inventario inicial'
      FROM producto
     WHERE id NOT IN (SELECT producto_id FROM movimiento_inventario)
  `);
}

async function inicializar() {
  await crearOMigrar();
  await migrarBackoffice();
}

async function crearOMigrar() {
  const existe = await client.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'usuario'"
  );
  if (existe.rows.length > 0) {
    await migrarPedidoConMetodosDeCobro();
    await client.executeMultiple(`
      CREATE TABLE IF NOT EXISTS intento_login (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        email     TEXT NOT NULL,
        creado_en INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_intento_login_email ON intento_login(email, creado_en);
    `);
    return;
  }

  await client.executeMultiple(schemaSql);
  await client.batch(
    [
      {
        sql: 'INSERT INTO usuario (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)',
        args: ['Administrador FitStock', 'admin@fitstock.com', hashPassword('Admin1234'), 'admin'],
      },
      {
        sql: 'INSERT INTO usuario (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)',
        args: ['Cliente Demo', 'demo@fitstock.com', hashPassword('Demo1234'), 'cliente'],
      },
    ],
    'write'
  );
  console.log('✅ Base de datos inicializada en', url);
}

const listo = inicializar();

function envolver(ejecutor) {
  return {
    async get(sql, ...args) {
      const r = await ejecutor.execute({ sql, args });
      return r.rows[0];
    },
    async all(sql, ...args) {
      const r = await ejecutor.execute({ sql, args });
      return r.rows;
    },
    async run(sql, ...args) {
      const r = await ejecutor.execute({ sql, args });
      return { changes: r.rowsAffected, lastInsertRowid: Number(r.lastInsertRowid) };
    },
  };
}

const base = envolver({
  async execute(stmt) {
    await listo;
    return client.execute(stmt);
  },
});

export const db = {
  ...base,
  async transaccion(fn) {
    await listo;
    const tx = await client.transaction('write');
    try {
      const resultado = await fn(envolver(tx));
      await tx.commit();
      return resultado;
    } catch (err) {
      await tx.rollback();
      throw err;
    } finally {
      tx.close();
    }
  },
};
