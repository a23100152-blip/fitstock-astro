// UsuariosAdmin.jsx — Módulo de usuarios del BackOffice.
// Alta con rol, edición de nombre/rol, activar/desactivar (cierra sus sesiones)
// y restablecer contraseña. Los registros nuevos de clientes llegan en vivo.
import { useEffect, useState } from 'react';
import { gql, useSuscripcion, SUB_EVENTO, EnVivo, mxn, fechaHora } from './api.jsx';
import { useToast } from '../../store/useToastStore.js';
import Modal from './Modal.jsx';

const CAMPOS = 'id nombre email rol activo fechaCreacion totalPedidos totalGastado';
const Q_USUARIOS = `query($b: String, $r: String) { usuarios(busqueda: $b, rol: $r) { ${CAMPOS} } }`;

export default function UsuariosAdmin({ inicial = [], yoId }) {
  const [usuarios, setUsuarios] = useState(inicial);
  const [busqueda, setBusqueda] = useState('');
  const [rol, setRol] = useState('');
  const [modal, setModal] = useState(null); // { tipo: 'nuevo' | 'editar' | 'password', usuario }
  const { showToast } = useToast();

  const cargar = async () => {
    try {
      setUsuarios((await gql(Q_USUARIOS, { b: busqueda || null, r: rol || null })).usuarios);
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  useEffect(() => {
    const t = setTimeout(cargar, 300);
    return () => clearTimeout(t);
  }, [busqueda, rol]);

  const estado = useSuscripcion(SUB_EVENTO, ({ eventoBackoffice: ev }) => {
    if (ev.entidad === 'usuario' || (ev.entidad === 'pedido' && ev.accion === 'pago')) cargar();
  });

  const reemplazar = (u) => setUsuarios((prev) => prev.map((x) => (x.id === u.id ? { ...x, ...u } : x)));

  const alternar = async (u) => {
    const accion = u.activo ? 'desactivar' : 'reactivar';
    if (!confirm(`¿Seguro que quieres ${accion} a ${u.nombre}?${u.activo ? ' Se cerrarán todas sus sesiones.' : ''}`)) return;
    try {
      const d = await gql(`mutation($id: ID!, $a: Boolean!) { cambiarEstadoUsuario(id: $id, activo: $a) { ${CAMPOS} } }`, { id: u.id, a: !u.activo });
      reemplazar(d.cambiarEstadoUsuario);
      showToast(`Usuario ${u.activo ? 'desactivado' : 'reactivado'}`);
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const activos = usuarios.filter((u) => u.activo).length;
  const admins = usuarios.filter((u) => u.rol === 'admin').length;

  return (
    <div className="dash-card">
      <div className="bo-toolbar">
        <input className="bo-input" placeholder="Buscar por nombre o correo…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        <select className="sel" value={rol} onChange={(e) => setRol(e.target.value)} aria-label="Filtrar por rol">
          <option value="">Todos los roles</option>
          <option value="cliente">Clientes</option>
          <option value="admin">Administradores</option>
        </select>
        <EnVivo estado={estado} />
        <button type="button" className="btn btn-primary bo-derecha" onClick={() => setModal({ tipo: 'nuevo' })}>+ Nuevo usuario</button>
      </div>
      <p className="bo-contador">{usuarios.length} usuario(s) · {activos} activos · {admins} administradores</p>

      <div className="tabla-scroll">
        <table className="tabla-admin">
          <thead>
            <tr><th>Usuario</th><th>Rol</th><th>Estado</th><th>Pedidos pagados</th><th>Total comprado</th><th>Alta</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className={u.activo ? '' : 'fila-inactiva'}>
                <td><strong>{u.nombre}</strong>{u.id === yoId && <small className="celda-fecha"> (tú)</small>}<br /><small className="celda-fecha">{u.email}</small></td>
                <td><span className={`tag ${u.rol === 'admin' ? 'tag-admin' : 'tag-cliente'}`}>{u.rol}</span></td>
                <td><span className={`tag ${u.activo ? 'tag-activo' : 'tag-inactivo'}`}>{u.activo ? 'Activo' : 'Desactivado'}</span></td>
                <td>{u.totalPedidos}</td>
                <td>{mxn(u.totalGastado)}</td>
                <td className="celda-fecha">{fechaHora(u.fechaCreacion)}</td>
                <td><div className="bo-acciones">
                  <button type="button" className="btn-mini" onClick={() => setModal({ tipo: 'editar', usuario: u })}>Editar</button>
                  <button type="button" className="btn-mini" onClick={() => setModal({ tipo: 'password', usuario: u })}>Contraseña</button>
                  <button type="button" className={`btn-mini ${u.activo ? 'btn-mini-peligro' : ''}`} onClick={() => alternar(u)} disabled={u.id === yoId}>
                    {u.activo ? 'Desactivar' : 'Reactivar'}
                  </button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="dash-nota">Un usuario desactivado no puede iniciar sesión y pierde sus sesiones abiertas. Siempre debe quedar al menos un administrador activo.</p>

      {modal?.tipo === 'nuevo' && (
        <FormNuevo onCerrar={() => setModal(null)} onGuardado={(u) => { setUsuarios((prev) => [u, ...prev]); setModal(null); showToast('Usuario creado'); }} />
      )}
      {modal?.tipo === 'editar' && (
        <FormEditar usuario={modal.usuario} esYo={modal.usuario.id === yoId} onCerrar={() => setModal(null)} onGuardado={(u) => { reemplazar(u); setModal(null); showToast('Usuario actualizado'); }} />
      )}
      {modal?.tipo === 'password' && (
        <FormPassword usuario={modal.usuario} onCerrar={() => setModal(null)} onGuardado={() => { setModal(null); showToast('Contraseña restablecida'); }} />
      )}
    </div>
  );
}

function FormNuevo({ onCerrar, onGuardado }) {
  const [f, setF] = useState({ nombre: '', email: '', password: '', rol: 'cliente' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }));
  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const d = await gql(`mutation($i: UsuarioAdminInput!) { crearUsuarioAdmin(input: $i) { ${CAMPOS} } }`, { i: f });
      onGuardado(d.crearUsuarioAdmin);
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <Modal titulo="Nuevo usuario" onCerrar={onCerrar}>
      <form className="bo-form" onSubmit={guardar}>
        <label className="bo-campo">Nombre<input value={f.nombre} onChange={set('nombre')} autoFocus /></label>
        <label className="bo-campo">Correo<input type="email" value={f.email} onChange={set('email')} /></label>
        <label className="bo-campo">Contraseña inicial<input type="password" value={f.password} onChange={set('password')} placeholder="Mín. 8, con letras y números" /></label>
        <label className="bo-campo">Rol
          <select value={f.rol} onChange={set('rol')}>
            <option value="cliente">Cliente</option>
            <option value="admin">Administrador</option>
          </select>
        </label>
        {error && <p className="auth-error bo-campo-full">{error}</p>}
        <div className="bo-form-acciones bo-campo-full">
          <button type="button" className="btn btn-secondary" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="btn btn-primary">Crear usuario</button>
        </div>
      </form>
    </Modal>
  );
}

function FormEditar({ usuario, esYo, onCerrar, onGuardado }) {
  const [nombre, setNombre] = useState(usuario.nombre);
  const [rol, setRol] = useState(usuario.rol);
  const [error, setError] = useState('');
  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const d = await gql(`mutation($id: ID!, $i: UsuarioUpdateInput!) { actualizarUsuario(id: $id, input: $i) { ${CAMPOS} } }`, { id: usuario.id, i: { nombre, rol } });
      onGuardado(d.actualizarUsuario);
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <Modal titulo={`Editar: ${usuario.email}`} onCerrar={onCerrar}>
      <form className="bo-form" onSubmit={guardar}>
        <label className="bo-campo">Nombre<input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus /></label>
        <label className="bo-campo">Rol
          <select value={rol} onChange={(e) => setRol(e.target.value)} disabled={esYo}>
            <option value="cliente">Cliente</option>
            <option value="admin">Administrador</option>
          </select>
        </label>
        {esYo && <p className="dash-nota bo-campo-full">No puedes cambiar tu propio rol.</p>}
        {error && <p className="auth-error bo-campo-full">{error}</p>}
        <div className="bo-form-acciones bo-campo-full">
          <button type="button" className="btn btn-secondary" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="btn btn-primary">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

function FormPassword({ usuario, onCerrar, onGuardado }) {
  const [nueva, setNueva] = useState('');
  const [error, setError] = useState('');
  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await gql('mutation($id: ID!, $n: String!) { restablecerPasswordUsuario(id: $id, nueva: $n) }', { id: usuario.id, n: nueva });
      onGuardado();
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <Modal titulo={`Restablecer contraseña: ${usuario.email}`} onCerrar={onCerrar}>
      <form className="bo-form" onSubmit={guardar}>
        <label className="bo-campo bo-campo-full">Nueva contraseña<input type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="Mín. 8, con letras y números" autoFocus /></label>
        <p className="dash-nota bo-campo-full">Se cerrarán todas las sesiones abiertas de este usuario.</p>
        {error && <p className="auth-error bo-campo-full">{error}</p>}
        <div className="bo-form-acciones bo-campo-full">
          <button type="button" className="btn btn-secondary" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="btn btn-primary">Restablecer</button>
        </div>
      </form>
    </Modal>
  );
}
