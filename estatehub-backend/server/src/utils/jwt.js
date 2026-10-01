// src/utils/jwt.js
// Signing/verifying both token types lives in one place so every controller
// (auth, and later refresh-flows) uses identical logic and secrets.

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../config/env');

// Every token gets a random `jti` (JWT ID). Without this, two tokens signed
// for the same user within the same second (same payload + same `iat`) would
// be byte-for-byte identical — which breaks the UNIQUE constraint on
// refresh_tokens.token_hash the moment a refresh happens quickly after login.
// Signing and verifying both pin HS256 explicitly rather than letting jsonwebtoken infer the
// algorithm from the token's own header. Without this pin, a token crafted with "alg: none" or a
// different algorithm could otherwise be accepted in some library/version combinations —
// verification must never trust the algorithm a presented token claims for itself.
const ALGORITHM = 'HS256';

function signAccessToken(payload) {
  return jwt.sign({ ...payload, jti: crypto.randomUUID() }, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessExpiresIn,
    algorithm: ALGORITHM,
  });
}

function signRefreshToken(payload) {
  return jwt.sign({ ...payload, jti: crypto.randomUUID() }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpiresIn,
    algorithm: ALGORITHM,
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.accessSecret, { algorithms: [ALGORITHM] });
}

function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwt.refreshSecret, { algorithms: [ALGORITHM] });
}

function decodeToken(token) {
  return jwt.decode(token);
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  decodeToken,
};