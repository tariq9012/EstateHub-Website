// src/models/passwordResetToken.model.js
// Mirrors refreshToken.model.js's approach: only a SHA-256 hash of the raw token is ever stored,
// never the token itself. See utils/tokenHash.js for why a deterministic hash (not bcrypt) is
// correct here -- we need to look a token up by exact match.

const { pool } = require('../config/db');

/**
 * `expiresInMinutes` is a plain duration. The expiry is computed on the DATABASE server (NOW() + interval), not in
 * Node, so app/DB clock skew and timezone formatting can't shorten or extend it. expires_at is a TIMESTAMPTZ
 * (an absolute instant), so `expires_at > NOW()` is exact under any session TimeZone.
 */
async function insertToken({ userId, tokenHash, expiresInMinutes }) {
  const result = await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES (:userId, :tokenHash, NOW() + (:expiresInSeconds::double precision * INTERVAL '1 second')) RETURNING reset_token_id`,
    { userId, tokenHash, expiresInSeconds: expiresInMinutes * 60 }
  );
  return result.rows[0].reset_token_id;
}

/** Returns the token row only if it exists, is unused, and hasn't expired. */
async function findValidByHash(tokenHash) {
  const { rows } = await pool.query(
    `SELECT * FROM password_reset_tokens
     WHERE token_hash = :tokenHash AND used_at IS NULL AND expires_at > NOW()
     LIMIT 1`,
    { tokenHash }
  );
  return rows[0] || null;
}

/** Compare-and-set: marks a token used only if it's still valid (unused, not expired). Returns true if applied. */
async function markUsedIfValid(resetTokenId) {
  const result = await pool.query(
    `UPDATE password_reset_tokens SET used_at = NOW()
     WHERE reset_token_id = :resetTokenId AND used_at IS NULL AND expires_at > NOW()`,
    { resetTokenId }
  );
  return result.rowCount === 1;
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
