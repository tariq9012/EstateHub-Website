// src/middleware/rateLimiter.js
// authLimiter: tight limit on login/register to slow down brute-force/credential-stuffing.
// apiLimiter: generous general limit applied to all /api/* routes.
//
// Counters live in memory by default (fine for one local process). On Vercel, instances are many and
// short-lived, so set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN to share counters across all of them
// (see upstashRateLimitStore.js). Without those variables production still works, but each instance counts
// separately, so the limits are best-effort only.

const rateLimit = require('express-rate-limit');
const { UpstashRateLimitStore } = require('./upstashRateLimitStore');

const sharedStoreConfigured = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

/** One store per limiter (they must not share a counter namespace). undefined => express-rate-limit's MemoryStore. */
function makeStore(prefix) {
  if (!sharedStoreConfigured) return undefined;
  return new UpstashRateLimitStore({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
    prefix: `estatehub:${prefix}:`,
    failClosed: process.env.RATE_LIMIT_FAIL_CLOSED === 'true',
  });
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many attempts. Please try again later.' },
  store: makeStore('auth'),
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please slow down.' },
  store: makeStore('api'),
});

module.exports = { authLimiter, apiLimiter, sharedStoreConfigured };
