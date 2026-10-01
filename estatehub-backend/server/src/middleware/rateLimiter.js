// src/middleware/rateLimiter.js
// authLimiter: tight limit on login/register to slow down brute-force/credential-stuffing.
// apiLimiter: generous general limit applied to all /api/* routes.

const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many attempts. Please try again later.' },
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please slow down.' },
});

module.exports = { authLimiter, apiLimiter };