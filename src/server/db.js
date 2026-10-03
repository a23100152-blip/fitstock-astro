// db.js — Base de datos libSQL (SQLite en la nube con Turso).
// Netlify corre el servidor como funciones "serverless": su disco es temporal
// y se borra en cada arranque, por eso un archivo .sqlite local perdía los
// usuarios y las sesiones. Ahora la BD vive en Turso (mismo SQL de SQLite).
//
// - En Netlify: define TURSO_DATABASE_URL y TURSO_AUTH_TOKEN.
// - En local, si no las defines, usa el archivo data/fitstock.sqlite.
//
// El esquema y la semilla (db/db.sql) se aplican solos la primera vez,
// cuando la tabla `usuario` todavía no existe.
import { createClient } from '@libsql/client';
import schemaSql from '../../db/db.sql?raw';
import { hashPassword } from './password.js';

const url = process.env.TURSO_DATABASE_URL || import.meta.env.TURSO_DATABASE_URL || 'file:data/fitstock.sqlite';
const authToken = process.env.TURSO_AUTH_TOKEN || import.meta.env.TURSO_AUTH_TOKEN;

if (url.startsWith('file:')) {
  const fs = await import('node:fs');
  fs.mkdirSync('data', { recursive: true });
}

export const client = (globalThis.__fitstockClient ??= createClient({ url, authToken }));

// Crea tablas + datos semilla solo si la BD está vacía.
async function inicializar() {
  const existe = await client.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'usuario'"
  );
  if (existe.rows.length > 0) {
    // Tablas agregadas después de la primera versión: se crean también en BDs ya existentes.
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

// Se ejecuta una sola vez por instancia del servidor.
const listo = (globalThis.__fitstockInit ??= inicializar());

// Pequeña API parecida a la que ya usaba el proyecto, pero asíncrona:
//   await db.get(sql, ...args)  -> una fila o undefined
//   await db.all(sql, ...args)  -> arreglo de filas
//   await db.run(sql, ...args)  -> { changes, lastInsertRowid }
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
  // Transacción real: si algo falla, se hace rollback de todo.
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
