// src/utils/tokenHash.js
// Refresh tokens are stored hashed (never in plaintext). We use SHA-256
// here instead of bcrypt because we need a *deterministic* hash to look
// the token up by exact match in refresh_tokens.token_hash — bcrypt's
// per-call random salt makes that kind of direct lookup impossible.
// The refresh token itself is already a high-entropy signed JWT, so a
// deterministic one-way hash is sufficient to protect it if the DB leaks.

const crypto = require('crypto');

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * A cryptographically secure, high-entropy random token for one-time links (password reset,
 * email verification, etc.) — the raw value is what goes in the emailed URL; only hashToken()'s
 * output of it is ever persisted (see passwordResetToken.model.js).
 */
function generateSecureToken() {
  return crypto.randomBytes(32).toString('hex'); // 256 bits of entropy
}

module.exports = { hashToken, generateSecureToken };