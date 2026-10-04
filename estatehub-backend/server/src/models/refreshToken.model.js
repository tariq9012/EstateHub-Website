// src/models/refreshToken.model.js

const { pool } = require('../config/db');

/**
 * `expiresAtUnixSeconds` is the JWT's own `exp` claim (an absolute Unix timestamp — unambiguous, no timezone
 * attached). to_timestamp() turns it into a timestamptz, i.e. an absolute instant, and refresh_tokens.expires_at
 * is a TIMESTAMPTZ, so the stored value and the `expires_at > NOW()` comparison below are both exact regardless
 * of any session TimeZone. (The MySQL version needed FROM_UNIXTIME + a session time_zone pin to get this
 * property; PostgreSQL's timestamptz has it by construction.)
 */
async function insertToken(executor, { userId, tokenHash, expiresAtUnixSeconds }) {
  const result = await executor.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES (:userId, :tokenHash, to_timestamp(:expiresAtUnixSeconds::double precision)) RETURNING token_id`,
    { userId, tokenHash, expiresAtUnixSeconds }
  );
  return result.rows[0].token_id;
}

/** Returns the token row only if it exists, isn't revoked, and hasn't expired. */
async function findValidByHash(tokenHash) {
  const { rows } = await pool.query(
    `SELECT * FROM refresh_tokens
     WHERE token_hash = :tokenHash AND revoked_at IS NULL AND expires_at > NOW()
     LIMIT 1`,
    { tokenHash }
  );
  return rows[0] || null;
}

async function revokeByHash(tokenHash) {
  await pool.query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = :tokenHash AND revoked_at IS NULL',
    { tokenHash }
  );
}

/** Used on logout-all-devices / password change. */
async function revokeAllForUser(userId) {
  await pool.query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = :userId AND revoked_at IS NULL',
    { userId }
  );
}

module.exports = { insertToken, findValidByHash, revokeByHash, revokeAllForUser };