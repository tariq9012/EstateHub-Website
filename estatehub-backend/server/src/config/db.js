// src/config/db.js
// PostgreSQL (Neon) connection pool — every model/controller imports `pool` from here.
//
//   pool.query(sql, params)         -> pg result ({ rows, rowCount, ... }); `params` is an object for
//                                      :named placeholders (compiled to $1, $2 ... and bound — never
//                                      interpolated) or an array for plain $1-style queries.
//   pool.withTransaction(async (tx) => { ... tx.query(...) ... })
//                                    -> BEGIN / COMMIT / ROLLBACK on ONE checked-out client, always released.
//
// ONE pool per process (module singleton). Vercel reuses a function instance for many requests, so the
// pool is created once, kept small (see env.js) and never created per request.

const { Pool, types } = require('pg');
const env = require('./env');
const { compileNamed, buildTypeParsers, redactDbError } = require('./dbHelpers');

const rawPool = new Pool({
  connectionString: env.db.url,
  // Used only when the URL has no `sslmode` parameter (an explicit sslmode in the URL always wins, and
  // pg treats sslmode=require as full certificate verification). Certificates are verified — verification
  // is never disabled here.
  ...(env.db.ssl ? { ssl: env.db.ssl } : {}),
  max: env.db.poolMax,
  // Neon (and serverless Postgres generally) closes idle connections; drop ours before the server does.
  idleTimeoutMillis: env.db.idleTimeoutMs,
  connectionTimeoutMillis: env.db.connectTimeoutMs,
  application_name: 'estatehub-api',
  types: buildTypeParsers(types),
});

// An idle client can be terminated by Neon (scale-to-zero, restarts). Without a listener Node would treat
// the emitted 'error' as uncaught and crash the function. The pool discards the broken client itself.
rawPool.on('error', (err) => {
  const { code, message } = redactDbError(err);
  // eslint-disable-next-line no-console
  console.error(`[db] idle client error${code ? ` (${code})` : ''}: ${message}`);
});

/** Wraps a pg Pool/PoolClient so models can pass :named parameter objects. */
function wrap(executor) {
  return {
    query(sql, params) {
      const { text, values } = compileNamed(sql, params);
      return executor.query(text, values);
    },
  };
}

const pool = {
  ...wrap(rawPool),

  /**
   * Runs `fn(tx)` inside one transaction on a single dedicated client. Commits if `fn` resolves, rolls
   * back if it throws (rethrowing the original error), and ALWAYS releases the client. If the rollback
   * itself fails the client is destroyed instead of being returned to the pool.
   */
  async withTransaction(fn) {
    const client = await rawPool.connect();
    let destroy = false;
    try {
      await client.query('BEGIN');
      const result = await fn(wrap(client));
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        destroy = true; // connection is unusable; the original error is what matters
      }
      throw err;
    } finally {
      client.release(destroy);
    }
  },

  /** Closes every connection (used by CLI scripts so the process can exit). */
  end() {
    return rawPool.end();
  },
};

/**
 * Verifies the pool can actually reach PostgreSQL. Used at server startup and by /api/health.
 * The error is sanitized — it never contains the connection string or password.
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
async function testConnection() {
  try {
    await rawPool.query('SELECT 1');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: redactDbError(err).message };
  }
}

module.exports = { pool, testConnection };
