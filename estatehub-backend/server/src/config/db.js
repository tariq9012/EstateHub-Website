// src/config/db.js
// mysql2/promise connection pool — every model/controller imports `pool`
// from here and calls pool.query(...) / pool.execute(...) on it.

const mysql = require('mysql2/promise');
const env = require('./env');

const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  database: env.db.name,
  user: env.db.user,
  password: env.db.password,
  waitForConnections: true,
  connectionLimit: 10,
  maxIdle: 10,
  idleTimeout: 60000,
  queueLimit: 0,
  namedPlaceholders: true,
  dateStrings: true, // return DATE/DATETIME as plain strings, not JS Date objects
});

// TIMEZONE POLICY: every pooled connection runs with session time_zone = UTC.
// - TIMESTAMP columns (created_at, expires_at, used_at, ...) are converted through the session
//   zone on write and read, and NOW()/FROM_UNIXTIME() return session-zone clock digits. Pinning
//   the session to UTC makes all of those UTC, independent of the OS/MySQL server default zone,
//   so the API's plain 'YYYY-MM-DD HH:MM:SS' strings (dateStrings: true) are always UTC.
// - appointments.scheduled_at is a DATETIME written/read as explicit UTC strings by JS
//   (utils/appointmentRules.js) and does not depend on the session zone at all.
// '+00:00' (an offset, not the named zone 'UTC') is used so it works even when the server has no
// timezone tables loaded. Issued on the underlying pool so it is queued before any caller query.
pool.pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+00:00'");
});

/**
 * Verifies the pool can actually reach MySQL. Used at server startup
 * and by the /api/health endpoint.
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    try {
      await connection.query('SELECT 1');
      return { ok: true };
    } finally {
      connection.release();
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { pool, testConnection };