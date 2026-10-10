// auth.js — Sesiones basadas en token opaco + tabla `sesion`.
// El token que se entrega al frontend es aleatorio; en la BD solo se
// guarda su SHA-256, así que un volcado de la BD no permite suplantar
// sesiones. (La gestión de la cookie del navegador vive en Astro —este
// archivo solo sabe de tokens, nunca de cookies ni de HTTP.)
import { createHash, randomBytes } from 'node:crypto';
import { db } from './db.js';
import { hashPassword, verifyPassword } from './password.js';

export const SESION_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

export async function limpiarSesionesVencidas() {
  await db.run('DELETE FROM sesion WHERE expira_en < ?', Date.now());
}

export async function crearSesion(usuarioId) {
  await limpiarSesionesVencidas();
  const token = randomBytes(32).toString('hex');
  await db.run(
    'INSERT INTO sesion (token_hash, usuario_id, expira_en) VALUES (?, ?, ?)',
    sha256(token),
    usuarioId,
    Date.now() + SESION_MS
  );
  return token;
}

export async function usuarioPorToken(token) {
  if (!token) return null;
  const row = await db.get(
    `SELECT u.id, u.nombre, u.email, u.rol, s.expira_en
       FROM sesion s JOIN usuario u ON u.id = s.usuario_id
      WHERE s.token_hash = ?`,
    sha256(token)
  );
  if (!row) return null;
  if (row.expira_en < Date.now()) {
    await destruirSesion(token);
    return null;
  }
  return { id: Number(row.id), nombre: row.nombre, email: row.email, rol: row.rol };
}

export async function destruirSesion(token) {
  if (token) await db.run('DELETE FROM sesion WHERE token_hash = ?', sha256(token));
}

// ---- Validaciones ----
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validarPassword(password, confirm) {
  if ((password || '').length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'La contraseña debe incluir letras y números.';
  if (password !== confirm) return 'Las contraseñas no coinciden.';
  return null;
}

export function validarNombre(nombre) {
  if (!nombre?.trim() || nombre.trim().length < 2) return 'Ingresa tu nombre (mínimo 2 caracteres).';
  return null;
}

export function validarRegistro({ nombre, email, password, confirm }) {
  const errorNombre = validarNombre(nombre);
  if (errorNombre) return errorNombre;
  if (!EMAIL_RE.test(email || '')) return 'El correo no tiene un formato válido.';
  return validarPassword(password, confirm);
}

export async function registrarUsuarioDb({ nombre, email, password }) {
  const correo = email.trim().toLowerCase();
  const existe = await db.get('SELECT id FROM usuario WHERE email = ?', correo);
  if (existe) return { error: 'Ya existe una cuenta con ese correo.' };
  const info = await db.run(
    'INSERT INTO usuario (nombre, email, password_hash) VALUES (?, ?, ?)',
    nombre.trim(),
    correo,
    hashPassword(password)
  );
  return { id: info.lastInsertRowid };
}

export async function autenticar(email, password) {
  const row = await db.get('SELECT * FROM usuario WHERE email = ?', (email || '').trim().toLowerCase());
  if (!row || !verifyPassword(password || '', row.password_hash)) return null;
  return Number(row.id);
}

// ---- Límite de intentos de login (protección contra fuerza bruta) ----
export const MAX_INTENTOS = 5;
export const VENTANA_MS = 15 * 60 * 1000; // 15 minutos

const normalizarCorreo = (email) => (email || '').trim().toLowerCase().slice(0, 254);

export async function minutosDeBloqueo(email) {
  const correo = normalizarCorreo(email);
  const desde = Date.now() - VENTANA_MS;
  const filas = await db.all(
    'SELECT creado_en FROM intento_login WHERE email = ? AND creado_en > ? ORDER BY creado_en ASC',
    correo,
    desde
  );
  if (filas.length < MAX_INTENTOS) return 0;
  const liberaEn = Number(filas[0].creado_en) + VENTANA_MS;
  return Math.max(1, Math.ceil((liberaEn - Date.now()) / 60000));
}

export async function registrarIntentoFallido(email) {
  await db.run('DELETE FROM intento_login WHERE creado_en < ?', Date.now() - VENTANA_MS);
  await db.run('INSERT INTO intento_login (email, creado_en) VALUES (?, ?)', normalizarCorreo(email), Date.now());
}

export async function limpiarIntentos(email) {
  await db.run('DELETE FROM intento_login WHERE email = ?', normalizarCorreo(email));
}

// ---- Cuenta: editar nombre y cambiar contraseña ----
export async function actualizarNombreDb(usuarioId, nombre) {
  await db.run('UPDATE usuario SET nombre = ? WHERE id = ?', nombre.trim(), usuarioId);
}

export async function cerrarOtrasSesiones(usuarioId, tokenActual) {
  await db.run('DELETE FROM sesion WHERE usuario_id = ? AND token_hash <> ?', usuarioId, sha256(tokenActual || ''));
}

export async function cambiarPasswordDb(usuarioId, tokenActual, { actual, nueva, confirm }) {
  const fila = await db.get('SELECT password_hash FROM usuario WHERE id = ?', usuarioId);
  if (!fila || !verifyPassword(actual || '', fila.password_hash)) return 'La contraseña actual no es correcta.';
  const errorNueva = validarPassword(nueva, confirm);
  if (errorNueva) return errorNueva;
  if (verifyPassword(nueva, fila.password_hash)) return 'La nueva contraseña debe ser distinta a la actual.';
  await db.run('UPDATE usuario SET password_hash = ? WHERE id = ?', hashPassword(nueva), usuarioId);
  await cerrarOtrasSesiones(usuarioId, tokenActual);
  return null;
}
