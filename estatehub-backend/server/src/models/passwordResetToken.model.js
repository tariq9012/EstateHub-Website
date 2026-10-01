// src/models/passwordResetToken.model.js
// Mirrors refreshToken.model.js's approach: only a SHA-256 hash of the raw token is ever stored,
// never the token itself. See utils/tokenHash.js for why a deterministic hash (not bcrypt) is
// correct here -- we need to look a token up by exact match.

const { pool } = require('../config/db');

/**
 * `expiresInMinutes` is a plain duration. The write and the comparisons below use the same
 * FROM_UNIXTIME(UNIX_TIMESTAMP() + N) / NOW() pattern as refreshToken.model.js, and for the same
 * reason: an earlier version of this file computed the expiry with
 * `DATE_ADD(UTC_TIMESTAMP(), INTERVAL :expiresInMinutes MINUTE)` and compared with
 * `expires_at > UTC_TIMESTAMP()`, on the theory that using UTC_TIMESTAMP() on both the write and
 * the read would make the session's time_zone offset "cancel out". It does not: UTC_TIMESTAMP()
 * always returns true-UTC clock digits regardless of session time_zone, but a TIMESTAMP column
 * reinterprets whatever literal it's given AS session-local time when converting it to the UTC
 * instant it actually stores -- so under any session time_zone other than +00:00, the WRITE silently
 * shifts the real stored expiry by the session's offset, while the READ-side comparison is exact.
 * There is no cancellation, only a real corruption of the stored instant (confirmed with real
 * numbers by estatehub-backend/server/scripts/smoke.js section 9, which runs this under +05:00 and
 * -05:00 sessions). config/db.js pins every pooled connection's session to UTC, so this never
 * manifests through the app's own pool today -- but FROM_UNIXTIME()/NOW() is correct independent of
 * session time_zone (proven by the same smoke-test section), so there is no reason to depend on
 * that pin for this specific query too. UNIX_TIMESTAMP() with no argument is evaluated once, at
 * query time, on the database server -- not in Node -- so this still avoids the clock-skew and
 * timezone-formatting problems of computing the expiry in JavaScript.
 */
async function insertToken({ userId, tokenHash, expiresInMinutes }) {
  const [result] = await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES (:userId, :tokenHash, FROM_UNIXTIME(UNIX_TIMESTAMP() + :expiresInSeconds))`,
    { userId, tokenHash, expiresInSeconds: expiresInMinutes * 60 }
  );
  return result.insertId;
}

/** Returns the token row only if it exists, is unused, and hasn't expired. */
async function findValidByHash(tokenHash) {
  const [rows] = await pool.query(
    `SELECT * FROM password_reset_tokens
     WHERE token_hash = :tokenHash AND used_at IS NULL AND expires_at > NOW()
     LIMIT 1`,
    { tokenHash }
  );
  return rows[0] || null;
}

/** Compare-and-set: marks a token used only if it's still valid (unused, not expired). Returns true if applied. */
async function markUsedIfValid(resetTokenId) {
  const [result] = await pool.query(
    `UPDATE password_reset_tokens SET used_at = NOW()
     WHERE reset_token_id = :resetTokenId AND used_at IS NULL AND expires_at > NOW()`,
    { resetTokenId }
  );
  return result.affectedRows === 1;
}

/**
 * Invalidates every other still-usable reset token for a user. Used both when a new reset is
 * requested (so only the newest link works) and right after a successful reset (belt-and-braces).
 */
async function invalidateAllForUser(userId) {
  await pool.query(
    `UPDATE password_reset_tokens SET used_at = NOW()
     WHERE user_id = :userId AND used_at IS NULL`,
    { userId }
  );
}

module.exports = { insertToken, findValidByHash, markUsedIfValid, invalidateAllForUser };
