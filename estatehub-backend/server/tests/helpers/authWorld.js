// tests/helpers/authWorld.js
// Same in-memory-substitution technique as tests/helpers/agentWorld.js, but auth.controller.js has
// a different dependency shape: it touches `pool` directly (for register's transaction) and, more
// importantly, its utils (jwt.js, password.js) wrap REAL third-party packages (jsonwebtoken,
// bcrypt) that are not installed in this sandbox (no network access — see the phase report).
// So in addition to stubbing the DB-touching models, this world also substitutes jwt.js/
// password.js/email.js/config/env.js with small faithful fakes that preserve their real
// *behavior* (expiry, malformed/expired rejection, hash-mismatch rejection) without needing the
// actual crypto libraries. tokenHash.js is NOT stubbed — it's pure Node `crypto` (a builtin, no
// package needed) so tests exercise the real hashing logic used in production.

const path = require('node:path');

const SRC = path.join(__dirname, '..', '..', 'src');

function makeAuthWorld() {
  const w = {
    users: {
      1: { user_id: 1, email: 'buyer@test.com', password_hash: 'hashed:Password123', role: 'buyer', first_name: 'Bea', last_name: 'Buyer', phone: null, status: 'active' },
      2: { user_id: 2, email: 'suspended@test.com', password_hash: 'hashed:Password123', role: 'buyer', first_name: 'Sus', last_name: 'Pended', phone: null, status: 'suspended' },
    },
    agents: {},
    adminUsers: {},
    refreshTokens: [], // { token_id, user_id, token_hash, expires_at_ms, revoked_at }
    resetTokens: [], // { reset_token_id, user_id, token_hash, expires_at_ms, used_at }
    sentEmails: [],
    nextUserId: 3,
    nextTokenId: 1,
    nextResetId: 1,
  };

  w.models = {
    user: {
      createUser: async (_conn, { email, passwordHash, role, firstName, lastName, phone }) => {
        const id = w.nextUserId++;
        w.users[id] = { user_id: id, email, password_hash: passwordHash, role, first_name: firstName, last_name: lastName, phone: phone || null, status: 'active' };
        return id;
      },
      findByEmail: async (email) => Object.values(w.users).find((u) => u.email === email) || null,
      findById: async (id) => w.users[id] || null,
      toSafeUser: (u) => {
        if (!u) return null;
        // eslint-disable-next-line no-unused-vars
        const { password_hash, ...safe } = u;
        return safe;
      },
      updatePasswordHash: async (id, hash) => { w.users[id].password_hash = hash; },
    },
    agent: {
      findByLicenseNumber: async (lic) => Object.values(w.agents).find((a) => a.license_number === lic) || null,
      createAgent: async (_conn, { userId, licenseNumber, agencyName, specialty, yearsExperience }) => {
        w.agents[userId] = { agent_id: userId, user_id: userId, license_number: licenseNumber, agency_name: agencyName || null, specialty: specialty || null, years_experience: yearsExperience ?? null, verification_status: 'unverified' };
      },
      findByUserId: async (uid) => w.agents[uid] || null,
    },
    adminUser: { findByUserId: async (uid) => w.adminUsers[uid] || null },
    // Both token stores keep `expires_at_ms` as a plain epoch-millisecond NUMBER — never a
    // formatted date string. This is deliberate: the real bug this fake must not mask was MySQL
    // silently reinterpreting a naive "YYYY-MM-DD HH:mm:ss" string in the wrong timezone (see
    // models/refreshToken.model.js and models/passwordResetToken.model.js). An epoch number has no
    // such ambiguity, so comparing `expires_at_ms > Date.now()` here is correct on any machine in
    // any timezone — which is exactly the property the real FROM_UNIXTIME()/UTC_TIMESTAMP() SQL
    // now also has (see those files' comments), so the fake and the real path agree.
    refreshToken: {
      insertToken: async (_executor, { userId, tokenHash, expiresAtUnixSeconds }) => {
        const id = w.nextTokenId++;
        w.refreshTokens.push({ token_id: id, user_id: userId, token_hash: tokenHash, expires_at_ms: expiresAtUnixSeconds * 1000, revoked_at: null });
        return id;
      },
      findValidByHash: async (hash) => w.refreshTokens.find((t) => t.token_hash === hash && !t.revoked_at && t.expires_at_ms > Date.now()) || null,
      revokeByHash: async (hash) => {
        const t = w.refreshTokens.find((x) => x.token_hash === hash && !x.revoked_at);
        if (t) t.revoked_at = Date.now();
      },
      revokeAllForUser: async (userId) => {
        w.refreshTokens.filter((t) => t.user_id === userId && !t.revoked_at).forEach((t) => { t.revoked_at = Date.now(); });
      },
    },
    passwordResetToken: {
      insertToken: async ({ userId, tokenHash, expiresInMinutes }) => {
        const id = w.nextResetId++;
        w.resetTokens.push({ reset_token_id: id, user_id: userId, token_hash: tokenHash, expires_at_ms: Date.now() + expiresInMinutes * 60 * 1000, used_at: null });
        return id;
      },
      findValidByHash: async (hash) => w.resetTokens.find((t) => t.token_hash === hash && !t.used_at && t.expires_at_ms > Date.now()) || null,
      markUsedIfValid: async (id) => {
        const t = w.resetTokens.find((x) => x.reset_token_id === id && !x.used_at && x.expires_at_ms > Date.now());
        if (t) { t.used_at = Date.now(); return true; }
        return false;
      },
      invalidateAllForUser: async (userId) => {
        w.resetTokens.filter((t) => t.user_id === userId && !t.used_at).forEach((t) => { t.used_at = Date.now(); });
      },
    },
  };

  // --- fake password.js: no bcrypt, but preserves "only the right plaintext matches" behavior ---
  w.password = {
    hashPassword: async (plain) => `hashed:${plain}`,
    comparePassword: async (plain, hash) => hash === `hashed:${plain}`,
  };

  // --- fake jwt.js: unsigned base64 JSON "tokens", but preserves real expiry/shape semantics ---
  const ACCESS_TTL_SEC = 900; // 15m
  const REFRESH_TTL_SEC = 2592000; // 30d
  function encode(payload) {
    return Buffer.from(JSON.stringify(payload)).toString('base64url');
  }
  function decode(token) {
    try {
      return JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    } catch (err) {
      return null;
    }
  }
  function verify(token) {
    const payload = decode(token);
    if (!payload) { const e = new Error('jwt malformed'); e.name = 'JsonWebTokenError'; throw e; }
    if (payload.exp < Math.floor(Date.now() / 1000)) { const e = new Error('jwt expired'); e.name = 'TokenExpiredError'; throw e; }
    return payload;
  }
  w.jwt = {
    signAccessToken: (payload) => encode({ ...payload, jti: Math.random().toString(36).slice(2), exp: Math.floor(Date.now() / 1000) + ACCESS_TTL_SEC }),
    signRefreshToken: (payload) => encode({ ...payload, jti: Math.random().toString(36).slice(2), exp: Math.floor(Date.now() / 1000) + REFRESH_TTL_SEC }),
    verifyAccessToken: (token) => verify(token),
    verifyRefreshToken: (token) => verify(token),
    decodeToken: (token) => decode(token),
    // Exposed so tests can craft an already-expired token deterministically.
    _encodeWithExp: (payload, exp) => encode({ ...payload, jti: Math.random().toString(36).slice(2), exp }),
  };

  w.email = {
    sendEmail: async (message) => { w.sentEmails.push(message); return { delivered: true, provider: 'fake' }; },
  };

  w.env = {
    nodeEnv: 'test',
    port: 5000,
    jwt: { accessSecret: 'test-access-secret', accessExpiresIn: '15m', refreshSecret: 'test-refresh-secret', refreshExpiresIn: '30d' },
    cookie: { secure: false, domain: 'localhost' },
    clientOrigin: 'http://localhost:5173',
    frontendUrl: 'http://localhost:5173',
    email: { from: 'EstateHub <no-reply@test.com>' },
  };

  // pool.withTransaction(fn) just runs fn with a tx whose query() returns an empty pg-style result; the
  // stubbed models ignore the executor and write straight to the world.
  w.pool = {
    withTransaction: async (fn) => fn({ query: async () => ({ rows: [], rowCount: 0 }) }),
    query: async () => ({ rows: [], rowCount: 0 }),
  };

  return w;
}

function fakeModule(filePath, exportsObj) {
  require.cache[filePath] = { id: filePath, filename: filePath, loaded: true, exports: exportsObj, children: [], paths: [] };
}

/** Stubs every dependency auth.controller.js needs, then requires it fresh. */
function loadAuthController(world) {
  fakeModule(require.resolve(path.join(SRC, 'config', 'db.js')), { pool: world.pool, testConnection: async () => ({ ok: true }) });
  fakeModule(require.resolve(path.join(SRC, 'config', 'env.js')), world.env);
  fakeModule(require.resolve(path.join(SRC, 'models', 'user.model.js')), world.models.user);
  fakeModule(require.resolve(path.join(SRC, 'models', 'agent.model.js')), world.models.agent);
  fakeModule(require.resolve(path.join(SRC, 'models', 'adminUser.model.js')), world.models.adminUser);
  fakeModule(require.resolve(path.join(SRC, 'models', 'refreshToken.model.js')), world.models.refreshToken);
  fakeModule(require.resolve(path.join(SRC, 'models', 'passwordResetToken.model.js')), world.models.passwordResetToken);
  fakeModule(require.resolve(path.join(SRC, 'utils', 'password.js')), world.password);
  fakeModule(require.resolve(path.join(SRC, 'utils', 'jwt.js')), world.jwt);
  fakeModule(require.resolve(path.join(SRC, 'utils', 'email.js')), world.email);
  // tokenHash.js and emailTemplates.js are intentionally NOT stubbed — pure logic, no missing deps.

  const f = require.resolve(path.join(SRC, 'controllers', 'auth.controller.js'));
  delete require.cache[f];
  return require(f);
}

/** Stubs authenticate.js's dependencies (jwt.js + user.model.js for the account-status check). */
function loadAuthenticateMiddleware(world) {
  fakeModule(require.resolve(path.join(SRC, 'utils', 'jwt.js')), world.jwt);
  fakeModule(require.resolve(path.join(SRC, 'models', 'user.model.js')), world.models.user);
  const f = require.resolve(path.join(SRC, 'middleware', 'authenticate.js'));
  delete require.cache[f];
  return require(f);
}

/** Same shape as agentWorld.js's call(), extended with res.cookie/clearCookie and req.cookies. */
function call(handler, { user, params = {}, body = {}, query = {}, cookies = {} } = {}) {
  return new Promise((resolve, reject) => {
    const res = {
      code: 200,
      cookieJar: {},
      clearedCookies: [],
      status(c) { this.code = c; return this; },
      json(b) { resolve({ status: this.code, body: b, cookieJar: this.cookieJar, clearedCookies: this.clearedCookies }); return this; },
      cookie(name, value, opts) { this.cookieJar[name] = { value, opts }; return this; },
      clearCookie(name, opts) { this.clearedCookies.push(name); delete this.cookieJar[name]; return this; },
    };
    const next = (err) => (err ? reject(err) : resolve({ status: 'next', body: null }));
    handler({ user, params, body, query, cookies, headers: {} }, res, next);
  });
}

module.exports = { makeAuthWorld, loadAuthController, loadAuthenticateMiddleware, call };
