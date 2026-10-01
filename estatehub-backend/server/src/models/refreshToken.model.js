// src/models/refreshToken.model.js

const { pool } = require('../config/db');

/**
 * `expiresAtUnixSeconds` is the JWT's own `exp` claim (an absolute Unix timestamp — unambiguous,
 * no timezone attached). We deliberately do NOT pass a JS-formatted "YYYY-MM-DD HH:mm:ss" string
 * here: `new Date(...).toISOString().slice(0,19).replace('T',' ')` produces UTC clock digits with
 * no timezone marker, and MySQL then reinterprets that naive string using the CONNECTION's session
 * time_zone (often the OS/system zone, not UTC) — silently shifting the stored expiry by the
 * session's UTC offset. `FROM_UNIXTIME()` is the correct idiom for the WRITE: it turns the absolute
 * instant into session-zone clock digits, which is exactly what a TIMESTAMP column expects, so the
 * stored instant is right under any session zone. The READ (findValidByHash below) must therefore
 * compare against a session-zone value too — `NOW()`, not `UTC_TIMESTAMP()` (UTC digits, which
 * would skew expiry by the session's UTC offset). config/db.js also pins every connection's
 * session time_zone to UTC. See the Auth Hardening phase report for how the original bug was caught
 * this was caught (a 30-minute password-reset token failing validation immediately, on a machine
 * whose timezone is far enough from UTC that the old bug's few-hour skew mattered — refresh tokens
 * share this exact pattern but their 30-day TTL made the same skew invisible in practice).
 */
async function insertToken(executor, { userId, tokenHash, expiresAtUnixSeconds }) {
  const [result] = await executor.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES (:userId, :tokenHash, FROM_UNIXTIME(:expiresAtUnixSeconds))`,
    { userId, tokenHash, expiresAtUnixSeconds }
  );
  return result.insertId;
}

/** Returns the token row only if it exists, isn't revoked, and hasn't expired. */
async function findValidByHash(tokenHash) {
  const [rows] = await pool.query(
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