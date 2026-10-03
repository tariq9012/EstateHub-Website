// src/middleware/upstashRateLimitStore.js
//
// Shared (cross-instance) rate-limit counters for serverless hosting, using Upstash Redis' REST API.
// Dependency-free: it only needs the global fetch of Node 18+. express-rate-limit's default MemoryStore keeps
// counters per process, so on Vercel — where many short-lived instances run in parallel — an attacker would get
// a fresh allowance on every cold instance. This store gives all instances one counter per key.
//
// Enabled automatically when UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set (see rateLimiter.js).
//
// Failure policy: if Redis is unreachable the store FAILS OPEN (the request is allowed and a warning is
// logged) instead of turning a Redis outage into a full API outage. The per-instance limits of the
// MemoryStore are NOT applied in that case. Set RATE_LIMIT_FAIL_CLOSED=true to reject instead (HTTP 500).

class UpstashRateLimitStore {
  constructor({ url, token, prefix = 'rl:', failClosed = false, fetchImpl } = {}) {
    if (!url || !token) throw new Error('UpstashRateLimitStore needs a url and a token');
    this.url = String(url).replace(/\/+$/, '');
    this.token = token;
    this.prefix = prefix;
    this.failClosed = failClosed;
    this.fetchImpl = fetchImpl || ((...args) => fetch(...args));
    this.windowMs = 15 * 60 * 1000;
  }

  /** express-rate-limit calls this once with the limiter's resolved options. */
  init(options) {
    if (options && options.windowMs) this.windowMs = options.windowMs;
  }

  async pipeline(commands) {
    const res = await this.fetchImpl(`${this.url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
    });
    if (!res.ok) throw new Error(`Upstash responded with HTTP ${res.status}`);
    const results = await res.json();
    if (!Array.isArray(results)) throw new Error('Unexpected Upstash response');
    const errored = results.find((r) => r && r.error);
    if (errored) throw new Error(`Upstash command failed: ${errored.error}`);
    return results.map((r) => r.result);
  }

  prefixed(key) {
    return `${this.prefix}${key}`;
  }

  async increment(key) {
    const k = this.prefixed(key);
    try {
      // INCR, start the window on the first hit only (NX), then read the remaining time.
      const [hits, , ttl] = await this.pipeline([
        ['INCR', k],
        ['PEXPIRE', k, String(this.windowMs), 'NX'],
        ['PTTL', k],
      ]);
      const ttlMs = Number(ttl) > 0 ? Number(ttl) : this.windowMs;
      return { totalHits: Number(hits), resetTime: new Date(Date.now() + ttlMs) };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[rate-limit] Upstash unavailable (${err.message}); ${this.failClosed ? 'rejecting' : 'allowing'} request`);
      if (this.failClosed) throw err;
      return { totalHits: 1, resetTime: new Date(Date.now() + this.windowMs) };
    }
  }

  async decrement(key) {
    try {
      await this.pipeline([['DECR', this.prefixed(key)]]);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[rate-limit] Upstash decrement failed: ${err.message}`);
    }
  }

  async resetKey(key) {
    try {
      await this.pipeline([['DEL', this.prefixed(key)]]);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[rate-limit] Upstash reset failed: ${err.message}`);
    }
  }
}

module.exports = { UpstashRateLimitStore };
