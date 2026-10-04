#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

/**
 * EstateHub live API smoke / security / timezone test.
 *
 * Runs against a REAL running backend and the REAL PostgreSQL (Neon) database behind it. It is NOT part of
 * `npm test` (which uses in-memory fakes, scoped to tests/ so this file is never swept into it —
 * do not rename this file to match *-test.js / *.test.js / test-*.js, or `node --test`'s default
 * discovery will pick it up and 'fail' since it correctly refuses to run without SMOKE_CONFIRM).
 * Nothing here has been executed by the person who wrote
 * it — the first real run is yours, and a result only counts if this script printed it.
 *
 * USAGE (from estatehub-backend/server, backend already running):
 *   SMOKE_CONFIRM=yes \
 *   SMOKE_ADMIN_EMAIL=admin@example.com SMOKE_ADMIN_PASSWORD='...' \
 *   node scripts/smoke.js
 *
 * ENV
 *   SMOKE_CONFIRM=yes        REQUIRED. The script writes test rows (users, a property, ...).
 *   SMOKE_BASE_URL           default http://localhost:<PORT from .env>/api
 *   SMOKE_ADMIN_EMAIL/PASSWORD   an existing admin (ideally super_admin). Without it, every check
 *                            that needs an admin is reported SKIP, never PASS.
 *   SMOKE_MODERATOR_EMAIL/PASSWORD, SMOKE_SUPPORT_EMAIL/PASSWORD   optional; enables the
 *                            admin permission-level checks (each costs one rate-limited login).
 *   SMOKE_REPORT=path.json   also write a JSON report.
 *
 * SAFETY
 *   - Refuses to run when NODE_ENV=production.
 *   - Test accounts use emails like smoke.<runId>.buyer@estatehub-smoke.test. Cleanup SQL is printed
 *     at the end; the script archives its test property but does not delete users.
 *   - Reads DB credentials from the backend's own .env (run it from the server directory).
 *
 * RATE LIMITS: login/register/refresh/forgot/reset share ONE limiter (20 per 15 min per IP). This
 * script uses ~17 (+1 per optional admin-level login). Re-running within 15 minutes, or a
 * previous failed run, can hit it: those checks are reported BLOCKED (not FAIL). Restart the
 * backend (the limiter is in-memory) or wait 15 minutes.
 *
 * TIMEZONE: to test server-side zone independence, run the whole thing twice, starting the
 * BACKEND once with TZ=UTC and once with TZ=Asia/Karachi. The PostgreSQL session-zone checks in section
 * 9 run on dedicated connections regardless.
 *
 * Statuses: PASS, FAIL, SKIP (precondition missing), BLOCKED (rate-limited), INFO (observation).
 * Exit code 1 if any FAIL.
 */

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const crypto = require('node:crypto');

const env = require('../src/config/env'); // loads ./.env, fails fast if required vars are missing
const { pool } = require('../src/config/db');
const { Client: PgClient } = require('pg');
const { UPLOAD_ROOT } = require('../src/config/paths');
const { generateSecureToken, hashToken } = require('../src/utils/tokenHash');
const passwordResetTokenModel = require('../src/models/passwordResetToken.model');
const refreshTokenModel = require('../src/models/refreshToken.model');

// ------------------------------------------------------------------ config / guards

const BASE = (process.env.SMOKE_BASE_URL || `http://localhost:${env.port}/api`).replace(/\/$/, '');
const ORIGIN = BASE.replace(/\/api$/, '');
const RUN_ID = `${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`;
const PASSWORD = 'Smoke-Pass-1234!';
const NEW_PASSWORD = 'Smoke-NewPass-5678!';
const EMAIL_DOMAIN = 'estatehub-smoke.test';
const adminCreds = process.env.SMOKE_ADMIN_EMAIL && process.env.SMOKE_ADMIN_PASSWORD
  ? { email: process.env.SMOKE_ADMIN_EMAIL, password: process.env.SMOKE_ADMIN_PASSWORD } : null;

if (process.env.SMOKE_CONFIRM !== 'yes') {
  console.error('Refusing to run: this script writes test data to the database behind the backend.\nRe-run with SMOKE_CONFIRM=yes after reading the header of scripts/smoke.js.');
  process.exit(2);
}
if (env.nodeEnv === 'production') {
  console.error('Refusing to run: NODE_ENV=production. Point this at a development/staging database.');
  process.exit(2);
}

// ------------------------------------------------------------------ tiny test harness

const results = [];
let authLimitedCalls = 0;
const AUTH_LIMITED = /\/auth\/(register|login|refresh|forgot-password|reset-password)$/;

class RateLimited extends Error {}

function record(section, name, status, detail = '') {
  results.push({ section, name, status, detail });
  const tag = { PASS: 'PASS   ', FAIL: 'FAIL   ', SKIP: 'SKIP   ', BLOCKED: 'BLOCKED', INFO: 'INFO   ' }[status];
  console.log(`  [${tag}] ${name}${detail ? ` — ${detail}` : ''}`);
}

let currentSection = '';
function section(title) {
  currentSection = title;
  console.log(`\n== ${title} ==`);
}

/**
 * Node's fetch (undici) wraps every network-level problem in a generic "fetch failed" TypeError
 * and puts the actual reason (ECONNREFUSED, self-signed cert, DNS failure, ...) on err.cause,
 * sometimes nested more than one level deep. Unwrap it so failures are diagnosable instead of
 * all printing the same useless "fetch failed".
 */
function describeError(err) {
  const parts = [err.message];
  let cause = err.cause;
  let depth = 0;
  while (cause && depth < 4) {
    parts.push(cause.code ? `${cause.code}: ${cause.message || cause}` : String(cause.message || cause));
    cause = cause.cause;
    depth += 1;
  }
  return parts.join(' <- caused by: ');
}

/** Runs one check; assertion failures become FAIL, rate limiting becomes BLOCKED. */
async function check(name, fn) {
  try {
    const out = await fn();
    if (out && out.skip) return record(currentSection, name, 'SKIP', out.skip);
    if (out && out.info) return record(currentSection, name, 'INFO', out.info);
    return record(currentSection, name, 'PASS', out && out.detail ? out.detail : '');
  } catch (err) {
    if (err instanceof RateLimited) return record(currentSection, name, 'BLOCKED', err.message);
    return record(currentSection, name, 'FAIL', describeError(err));
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}
function assertStatus(res, expected, label = '') {
  const list = Array.isArray(expected) ? expected : [expected];
  assert(list.includes(res.status), `${label}expected HTTP ${list.join(' or ')}, got ${res.status}${res.body && res.body.error ? ` (${res.body.error})` : ''}`);
}

// ------------------------------------------------------------------ HTTP helpers

/** JSON / multipart request via fetch. Returns { status, body, headers, setCookies }. */
async function api(method, urlPath, { token, json, form, cookie, headers = {} } = {}) {
  if (AUTH_LIMITED.test(urlPath)) authLimitedCalls += 1;
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (cookie) h.Cookie = `refreshToken=${cookie}`;
  let body;
  if (json !== undefined) { h['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  if (form) body = form;
  const res = await fetch(`${BASE}${urlPath}`, { method, headers: h, body });
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  const out = { status: res.status, body: parsed, text, headers: res.headers, setCookies };
  if (res.status === 429 && AUTH_LIMITED.test(urlPath)) throw new RateLimited(`auth rate limit hit (${authLimitedCalls} auth-limited calls this run)`);
  return out;
}

/** Raw GET that does NOT normalise '..' segments (fetch/URL would). */
function rawGet(rawPath) {
  return new Promise((resolve, reject) => {
    const u = new URL(ORIGIN);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request({ hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80), path: rawPath, method: 'GET' }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8'), headers: res.headers }));
    });
    req.on('error', reject);
    req.end();
  });
}

function cookieValue(setCookies, name = 'refreshToken') {
  for (const c of setCookies) {
    const m = new RegExp(`^${name}=([^;]*)`).exec(c);
    if (m) return { value: decodeURIComponent(m[1]), raw: c };
  }
  return null;
}

// tiny valid files (magic bytes are what the server checks)
const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const PDF_MIN = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n', 'latin1');

function fileForm(field, buffer, filename, mime, extra = {}) {
  const fd = new FormData();
  Object.entries(extra).forEach(([k, v]) => fd.append(k, v));
  fd.append(field, new Blob([buffer], { type: mime }), filename);
  return fd;
}

function listUploadFiles(sub) {
  try { return fs.readdirSync(path.join(UPLOAD_ROOT, sub)).filter((f) => f !== '.gitkeep'); } catch { return []; }
}

function findUploadUrl(obj, prefix) {
  if (!obj) return null;
  if (typeof obj === 'string') return obj.startsWith(prefix) ? obj : null;
  if (Array.isArray(obj)) { for (const v of obj) { const r = findUploadUrl(v, prefix); if (r) return r; } return null; }
  if (typeof obj === 'object') { for (const v of Object.values(obj)) { const r = findUploadUrl(v, prefix); if (r) return r; } }
  return null;
}

function b64url(buf) { return Buffer.from(buf).toString('base64url'); }
function forgeJwt(payload, secret, alg = 'HS256') {
  const header = b64url(JSON.stringify({ alg, typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  if (alg === 'none') return `${header}.${body}.`;
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}
function decodeJwt(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

// ------------------------------------------------------------------ shared state

const S = {
  buyer: { email: `smoke.${RUN_ID}.buyer@${EMAIL_DOMAIN}`, password: PASSWORD },
  agentA: { email: `smoke.${RUN_ID}.agenta@${EMAIL_DOMAIN}`, password: PASSWORD },
  agentB: { email: `smoke.${RUN_ID}.agentb@${EMAIL_DOMAIN}`, password: PASSWORD },
  admin: { token: null },
  typeId: null,
  amenityIds: [],
  propertyId: null,
};
const NONEXISTENT_ID = 2147483000;

async function register(user, role, extra = {}) {
  const res = await api('POST', '/auth/register', {
    json: { email: user.email, password: user.password, firstName: 'Smoke', lastName: role, role, ...extra },
  });
  assertStatus(res, 201, `register ${role}: `);
  user.token = res.body.data ? res.body.data.accessToken : res.body.accessToken;
  const u = res.body.data ? res.body.data.user : res.body.user;
  user.id = u.user_id;
  user.role = u.role;
  const c = cookieValue(res.setCookies);
  user.cookie = c ? c.value : null;
  user.cookieRaw = c ? c.raw : null;
  return res;
}

// success() wraps payloads — support both { data: {...} } and flat shapes
function data(res) {
  return res.body && res.body.data !== undefined ? res.body.data : res.body;
}

// ------------------------------------------------------------------ sections

async function s0_preflight() {
  section('0. Preflight');
  await check('backend reachable and healthy (GET /health)', async () => {
    const res = await api('GET', '/health');
    assertStatus(res, 200);
  });
  await check('helmet security headers present (x-content-type-options)', async () => {
    const res = await api('GET', '/health');
    assert(res.headers.get('x-content-type-options') === 'nosniff', 'x-content-type-options: nosniff header missing');
  });
  await check('PostgreSQL reachable through the backend pool; report version and session zone', async () => {
    const { rows: [row] } = await pool.query("SELECT version() AS version, current_setting('TimeZone') AS session_tz");
    return { info: `${String(row.version).split(' on ')[0]}; session TimeZone=${row.session_tz}` };
  });
  await check('lookups available (property types + amenities)', async () => {
    const t = data(await api('GET', '/lookups/property-types'));
    const a = data(await api('GET', '/lookups/amenities'));
    assert(t.propertyTypes && t.propertyTypes.length > 0, 'no property types — run database/seeds first');
    S.typeId = t.propertyTypes[0].type_id;
    S.amenityIds = (a.amenities || []).slice(0, 2).map((x) => x.amenity_id);
    assert(S.amenityIds.length > 0, 'no amenities — run database/seeds first');
  });
}

async function s1_auth() {
  section('1. Authentication');
  await check('register buyer / agent A / agent B (201, access token, refresh cookie)', async () => {
    await register(S.buyer, 'buyer');
    await register(S.agentA, 'agent', { licenseNumber: `SMOKE-A-${RUN_ID}` });
    await register(S.agentB, 'agent', { licenseNumber: `SMOKE-B-${RUN_ID}` });
    assert(S.buyer.cookie && S.agentA.cookie && S.agentB.cookie, 'a register response did not set the refreshToken cookie');
    assert(S.buyer.role === 'buyer' && S.agentA.role === 'agent', 'unexpected roles returned');
  });
  await check('public registration cannot create an admin (role=admin rejected, no user row)', async () => {
    const email = `smoke.${RUN_ID}.evil@${EMAIL_DOMAIN}`;
    const res = await api('POST', '/auth/register', { json: { email, password: PASSWORD, firstName: 'E', lastName: 'Vil', role: 'admin' } });
    assertStatus(res, [400, 422], 'role=admin: ');
    const { rows } = await pool.query('SELECT user_id FROM users WHERE email = $1', [email]);
    assert(rows.length === 0, 'a user row was created for a rejected admin registration');
  });
  await check('user objects never expose password hashes', async () => {
    if (!S.buyer.token) return { skip: 'buyer registration did not complete earlier in this run (see above)' };
    const res = await api('GET', '/auth/me', { token: S.buyer.token });
    assertStatus(res, 200);
    assert(!/password_hash|"password"\s*:/i.test(res.text), "response contains a password field");
  });
  await check('refresh cookie is HttpOnly, path-scoped to /api/auth, SameSite set', async () => {
    if (!S.buyer.cookieRaw) return { skip: 'buyer registration did not complete earlier in this run (see above)' };
    const raw = S.buyer.cookieRaw || '';
    assert(/HttpOnly/i.test(raw), 'cookie is not HttpOnly');
    assert(/Path=\/api\/auth/i.test(raw), 'cookie Path is not /api/auth');
    assert(/SameSite=/i.test(raw), 'cookie has no SameSite attribute');
    if (env.nodeEnv === 'production') assert(/Secure/i.test(raw), 'cookie not Secure in production');
    return { detail: /Secure/i.test(raw) ? 'Secure flag set' : 'Secure flag NOT set (fine for local http; must be set in production via COOKIE_SECURE=true)' };
  });
  await check('wrong password -> 401', async () => {
    const res = await api('POST', '/auth/login', { json: { email: S.buyer.email, password: 'definitely-wrong-password' } });
    assertStatus(res, 401);
  });
  await check('GET /auth/me: no token -> 401, garbage token -> 401', async () => {
    assertStatus(await api('GET', '/auth/me'), 401, 'no token: ');
    assertStatus(await api('GET', '/auth/me', { token: 'not.a.jwt' }), 401, 'garbage: ');
  });
  await check('tampered access token (flipped signature) -> 401', async () => {
    if (!S.buyer.token) return { skip: 'buyer registration did not complete earlier in this run (see above)' };
    const t = S.buyer.token; const flipped = t.slice(0, -2) + (t.endsWith('AA') ? 'BB' : 'AA');
    assertStatus(await api('GET', '/auth/me', { token: flipped }), 401);
  });
  await check('forged admin token signed with a wrong secret -> 401', async () => {
    if (!S.buyer.token) return { skip: 'buyer registration did not complete earlier in this run (see above)' };
    const payload = { ...decodeJwt(S.buyer.token), role: 'admin' };
    assertStatus(await api('GET', '/admin/dashboard-stats', { token: forgeJwt(payload, 'wrong-secret') }), 401);
  });
  await check('alg=none token -> 401', async () => {
    if (!S.buyer.token) return { skip: 'buyer registration did not complete earlier in this run (see above)' };
    const payload = { ...decodeJwt(S.buyer.token), role: 'admin' };
    assertStatus(await api('GET', '/admin/dashboard-stats', { token: forgeJwt(payload, '', 'none') }), 401);
  });
  await check('refresh token used as access token -> 401', async () => {
    assertStatus(await api('GET', '/auth/me', { token: S.buyer.cookie }), 401);
  });
  await check('admin login (uses SMOKE_ADMIN_*)', async () => {
    if (!adminCreds) return { skip: 'SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD not set — all admin checks will be SKIP' };
    const res = await api('POST', '/auth/login', { json: adminCreds });
    assertStatus(res, 200, 'admin login: ');
    const d = data(res);
    assert(d.user.role === 'admin', 'account is not an admin');
    S.admin.token = d.accessToken;
  });
}

async function s2_refresh() {
  section('2. Refresh tokens (rotation, reuse, logout, storage)');
  let rotated = null;
  await check('refresh with valid cookie -> 200, new access token, ROTATED cookie', async () => {
    const res = await api('POST', '/auth/refresh', { cookie: S.buyer.cookie });
    assertStatus(res, 200);
    const c = cookieValue(res.setCookies);
    assert(c && c.value && c.value !== S.buyer.cookie, 'refresh cookie was not rotated');
    assert(data(res).accessToken, 'no new access token');
    rotated = c.value;
  });
  await check('re-using the OLD (rotated-out) refresh cookie -> 401', async () => {
    assertStatus(await api('POST', '/auth/refresh', { cookie: S.buyer.cookie }), 401);
  });
  await check('refresh tokens are stored hashed (no raw value in DB, sha-256 hex) with correct expiry', async () => {
    const { rows } = await pool.query('SELECT token_hash, EXTRACT(EPOCH FROM expires_at) AS exp_unix, revoked_at FROM refresh_tokens WHERE user_id = $1', [S.agentA.id]);
    assert(rows.length > 0, 'no refresh token row for the agent');
    for (const r of rows) {
      assert(/^[0-9a-f]{64}$/.test(r.token_hash), 'token_hash is not a 64-char hex digest');
      assert(r.token_hash !== S.agentA.cookie, 'raw refresh token stored in DB');
    }
    // Timezone write-path check: stored instant must equal the JWT's own exp claim (tz-independent).
    const exp = decodeJwt(S.agentA.cookie).exp;
    const active = rows.find((r) => !r.revoked_at) || rows[0];
    assert(Math.abs(Number(active.exp_unix) - exp) <= 2, `stored expiry differs from JWT exp by ${Number(active.exp_unix) - exp}s (timezone bug?)`);
  });
  await check('logout revokes the refresh token (agent B): refresh afterwards -> 401', async () => {
    const out = await api('POST', '/auth/logout', { cookie: S.agentB.cookie, token: S.agentB.token });
    assertStatus(out, 200);
    assertStatus(await api('POST', '/auth/refresh', { cookie: S.agentB.cookie }), 401);
  });
  S.buyer.rotatedCookie = rotated; // used after password reset (section 8)
}

async function s3_authorization() {
  section('3. Role authorization matrix');
  const cases = [
    // [label, method, path, token-owner, expected]
    ['anon GET /auth/me', 'GET', '/auth/me', null, 401],
    ['anon GET /favorites', 'GET', '/favorites', null, 401],
    ['anon POST /properties', 'POST', '/properties', null, 401],
    ['anon GET /admin/users', 'GET', '/admin/users', null, 401],
    ['buyer GET /admin/dashboard-stats', 'GET', '/admin/dashboard-stats', 'buyer', 403],
    ['buyer GET /admin/users', 'GET', '/admin/users', 'buyer', 403],
    ['buyer PUT /admin/users/:id/status', 'PUT', `/admin/users/${NONEXISTENT_ID}/status`, 'buyer', 403],
    ['buyer PUT /properties/:id/approve', 'PUT', `/properties/${NONEXISTENT_ID}/approve`, 'buyer', 403],
    ['buyer GET /verification/queue', 'GET', '/verification/queue', 'buyer', 403],
    ['buyer GET /license-renewals (admin list)', 'GET', '/license-renewals', 'buyer', 403],
    ['buyer GET /agents/me/listings', 'GET', '/agents/me/listings', 'buyer', 403],
    ['buyer GET /inquiries/received', 'GET', '/inquiries/received', 'buyer', 403],
    ['buyer GET /appointments/agent', 'GET', '/appointments/agent', 'buyer', 403],
    ['buyer GET /verification/me', 'GET', '/verification/me', 'buyer', 403],
    ['buyer POST /license-renewals', 'POST', '/license-renewals', 'buyer', 403],
    ['agent GET /admin/dashboard-stats', 'GET', '/admin/dashboard-stats', 'agentA', 403],
    ['agent GET /admin/users', 'GET', '/admin/users', 'agentA', 403],
    ['agent PUT /properties/:id/approve', 'PUT', `/properties/${NONEXISTENT_ID}/approve`, 'agentA', 403],
    ['agent PUT /properties/:id/reject', 'PUT', `/properties/${NONEXISTENT_ID}/reject`, 'agentA', 403],
    ['agent GET /verification/queue', 'GET', '/verification/queue', 'agentA', 403],
    ['agent PUT /verification/:agentId/verify', 'PUT', `/verification/${NONEXISTENT_ID}/verify`, 'agentA', 403],
    ['agent GET /license-renewals (admin list)', 'GET', '/license-renewals', 'agentA', 403],
    ['agent PUT /admin/users/:id/status', 'PUT', `/admin/users/${NONEXISTENT_ID}/status`, 'agentA', 403],
  ];
  for (const [label, method, p, who, expected] of cases) {
    await check(label, async () => {
      const token = who ? S[who].token : undefined;
      const res = await api(method, p, { token, json: method === 'GET' ? undefined : {} });
      assertStatus(res, expected);
    });
  }
  await check('positive control: buyer GET /favorites -> 200, agent GET /agents/me/listings -> 200', async () => {
    assertStatus(await api('GET', '/favorites', { token: S.buyer.token }), 200, 'buyer favorites: ');
    assertStatus(await api('GET', '/agents/me/listings', { token: S.agentA.token }), 200, 'agent listings: ');
  });
  await check('positive control: admin GET /admin/dashboard-stats -> 200', async () => {
    if (!S.admin.token) return { skip: 'no admin credentials' };
    assertStatus(await api('GET', '/admin/dashboard-stats', { token: S.admin.token }), 200);
  });
  // Optional admin permission levels
  for (const level of ['MODERATOR', 'SUPPORT']) {
    const email = process.env[`SMOKE_${level}_EMAIL`]; const password = process.env[`SMOKE_${level}_PASSWORD`];
    await check(`admin permission level: ${level.toLowerCase()}`, async () => {
      if (!email || !password) return { skip: `SMOKE_${level}_EMAIL/PASSWORD not set` };
      const login = await api('POST', '/auth/login', { json: { email, password } });
      assertStatus(login, 200, 'login: ');
      const tok = data(login).accessToken;
      const suspend = await api('PUT', `/admin/users/${NONEXISTENT_ID}/status`, { token: tok, json: { status: 'suspended' } });
      assertStatus(suspend, 403, `${level} must not change user status: `);
      const approve = await api('PUT', `/properties/${NONEXISTENT_ID}/approve`, { token: tok });
      if (level === 'SUPPORT') assertStatus(approve, 403, 'support is read-only, approve: ');
      else assertStatus(approve, [404, 409], 'moderator may approve (404/409 for a nonexistent id, not 403): ');
      assertStatus(await api('GET', '/admin/users', { token: tok }), 200, 'read access: ');
    });
  }
}

async function s4_propertyOwnership() {
  section('4. Property creation + ownership (buyer create blocked; Agent B vs Agent A)');
  const payload = (suffix = '') => ({
    typeId: S.typeId, title: `[SMOKE ${RUN_ID}] listing${suffix}`, description: 'Smoke test listing', price: 123456,
    listingType: 'sale', bedrooms: 3, bathrooms: 2, areaSqft: 1500, yearBuilt: 2010,
    addressLine: '1 Smoke Test Way', city: 'Smoketown', country: 'Testland', latitude: 33.6844, longitude: 73.0479,
  });

  await check('BUYER cannot create a property: POST /properties -> 403, and NO row is created', async () => {
    const res = await api('POST', '/properties', { token: S.buyer.token, json: payload(' (buyer attempt)') });
    assertStatus(res, 403);
    const { rows } = await pool.query('SELECT property_id FROM properties WHERE listed_by_user_id = $1', [S.buyer.id]);
    assert(rows.length === 0, `${rows.length} property row(s) exist for the buyer`);
  });
  await check('AGENT A can create a property -> 201, not publicly visible until approved', async () => {
    const res = await api('POST', '/properties', { token: S.agentA.token, json: payload() });
    assertStatus(res, 201);
    const p = data(res).property;
    S.propertyId = p.property_id;
    assert(['pending_review', 'draft'].includes(p.status), `new listing status is ${p.status}`);
  });
  await check('unapproved listing is invisible to anon and to buyer (GET /properties/:id -> 404)', async () => {
    assertStatus(await api('GET', `/properties/${S.propertyId}`), 404, 'anon: ');
    assertStatus(await api('GET', `/properties/${S.propertyId}`, { token: S.buyer.token }), 404, 'buyer: ');
  });
  await check('public list never leaks non-public statuses even when requested (status whitelist)', async () => {
    const res = await api('GET', '/properties?status=pending_review,draft,rejected,archived&limit=50');
    assertStatus(res, 200);
    const list = data(res).properties || [];
    assert(!list.some((p) => p.property_id === S.propertyId), 'pending listing appeared in public results');
    assert(list.every((p) => ['active', 'under_contract', 'sold'].includes(p.status)), 'a non-public status appeared in public results');
  });
  await check('public list accepts status=under_contract,sold and returns only those statuses', async () => {
    const res = await api('GET', '/properties?status=under_contract,sold&limit=50');
    assertStatus(res, 200);
    const list = data(res).properties || [];
    assert(list.every((p) => ['under_contract', 'sold'].includes(p.status)), 'unexpected status in results');
    return { detail: `${list.length} result(s)` };
  });

  const filesBefore = listUploadFiles('properties').length;
  const B = S.agentB; const BU = S.buyer; const id = S.propertyId;
  for (const [who, U] of [['AGENT B', B], ['BUYER', BU]]) {
    await check(`${who} cannot PUT /properties/:id (A's listing) -> 403`, async () => {
      assertStatus(await api('PUT', `/properties/${id}`, { token: U.token, json: { title: `[SMOKE ${RUN_ID}] HIJACKED` } }), 403);
    });
    await check(`${who} cannot PUT /properties/:id/amenities -> 403`, async () => {
      assertStatus(await api('PUT', `/properties/${id}/amenities`, { token: U.token, json: { amenityIds: S.amenityIds } }), 403);
    });
    await check(`${who} cannot DELETE /properties/:id -> 403`, async () => {
      assertStatus(await api('DELETE', `/properties/${id}`, { token: U.token }), 403);
    });
    await check(`${who} cannot upload images to A's listing -> 403 and no file written`, async () => {
      const res = await api('POST', `/properties/${id}/images`, { token: U.token, form: fileForm('images', PNG_1x1, 'x.png', 'image/png') });
      assertStatus(res, 403);
      assert(listUploadFiles('properties').length === filesBefore, 'a file was written to uploads/properties');
    });
  }
  await check("Agent A's listing is unchanged after Agent B / buyer attempts (title, archived state, amenities)", async () => {
    const { rows: [row] } = await pool.query('SELECT title, status FROM properties WHERE property_id = $1', [id]);
    assert(row.title.endsWith('] listing'), `title changed to "${row.title}"`);
    assert(row.status !== 'archived', 'listing was archived by a non-owner');
    const { rows: am } = await pool.query('SELECT amenity_id FROM property_amenities WHERE property_id = $1', [id]);
    assert(am.length === 0, 'amenities were written by a non-owner');
  });
  await check('AGENT A (owner) can PUT amenities and PUT own title -> 200', async () => {
    assertStatus(await api('PUT', `/properties/${id}/amenities`, { token: S.agentA.token, json: { amenityIds: S.amenityIds } }), 200, 'amenities: ');
    assertStatus(await api('PUT', `/properties/${id}`, { token: S.agentA.token, json: { title: `[SMOKE ${RUN_ID}] listing (edited)` } }), 200, 'title: ');
  });
  await check('nonexistent property: PUT amenities by agent -> 404 (not a 500)', async () => {
    assertStatus(await api('PUT', `/properties/${NONEXISTENT_ID}/amenities`, { token: S.agentA.token, json: { amenityIds: S.amenityIds } }), 404);
  });
}

async function s5_crossRoleFlow() {
  section('5. Cross-role flow (agent -> admin -> buyer -> agent -> buyer)');
  const id = S.propertyId;
  await check('ADMIN approves the listing -> 200 and it becomes public', async () => {
    if (!S.admin.token) return { skip: 'no admin credentials — remaining flow checks depend on approval' };
    const res = await api('PUT', `/properties/${id}/approve`, { token: S.admin.token });
    assertStatus(res, 200, 'approve (needs super_admin or moderator): ');
    S.approved = true;
    assertStatus(await api('GET', `/properties/${id}`), 200, 'public detail: ');
  });
  if (!S.approved) {
    for (const n of ['buyer discovers listing in public search', 'buyer favorites', 'buyer inquiry', 'buyer/agent messages', 'appointment request + UTC storage', 'agent confirms appointment', 'buyer sees confirmed appointment']) {
      record(currentSection, n, 'SKIP', 'listing not approved (no admin credentials or approve failed)');
    }
    return;
  }
  await check('approval wrote a property_approved row to admin_action_log', async () => {
    const { rows } = await pool.query(
      "SELECT log_id FROM admin_action_log WHERE action_type = 'property_approved' AND target_type = 'property' AND target_id = $1", [id]);
    assert(rows.length >= 1, 'no property_approved audit row for this listing');
  });
  await check('ADMIN re-approving an already-approved listing is refused (409, not a silent 200)', async () => {
    assertStatus(await api('PUT', `/properties/${id}/approve`, { token: S.admin.token }), 409);
  });
  await check('ADMIN reject requires a reason (empty reason -> 400/422; status unchanged)', async () => {
    assertStatus(await api('PUT', `/properties/${id}/reject`, { token: S.admin.token, json: { reason: '   ' } }), [400, 422]);
    const { rows: [row] } = await pool.query('SELECT status FROM properties WHERE property_id = $1', [id]);
    assert(row.status === 'active', `listing status changed to ${row.status} by an invalid reject`);
  });
  await check('ADMIN reject of a nonexistent listing -> 404', async () => {
    assertStatus(await api('PUT', `/properties/${NONEXISTENT_ID}/reject`, { token: S.admin.token, json: { reason: 'smoke' } }), 404);
  });
  await check('BUYER discovers the listing via public search (keyword) and detail', async () => {
    const res = await api('GET', `/properties?keyword=${encodeURIComponent(`SMOKE ${RUN_ID}`)}`);
    assertStatus(res, 200);
    assert((data(res).properties || []).some((p) => p.property_id === id), 'approved listing not found by search');
  });
  await check('BUYER favorites the listing and sees it in /favorites', async () => {
    const add = await api('POST', `/favorites/${id}`, { token: S.buyer.token });
    assertStatus(add, [200, 201]);
    const list = await api('GET', '/favorites', { token: S.buyer.token });
    assert(JSON.stringify(list.body).includes(`"property_id":${id}`), 'favorite not listed');
  });
  let conversationId = null;
  await check('BUYER sends an inquiry -> 201 with a conversation', async () => {
    const res = await api('POST', '/inquiries', { token: S.buyer.token, json: { propertyId: id, message: 'Smoke test inquiry: is this available?' } });
    assertStatus(res, 201);
    conversationId = data(res).conversationId;
    assert(conversationId, 'no conversationId returned');
  });
  await check('AGENT A receives the inquiry', async () => {
    const res = await api('GET', '/inquiries/received', { token: S.agentA.token });
    assertStatus(res, 200);
    assert(JSON.stringify(res.body).includes('Smoke test inquiry'), 'inquiry not in agent inbox');
  });
  await check('AGENT B (uninvolved) cannot read or write the conversation', async () => {
    assertStatus(await api('GET', `/conversations/${conversationId}/messages`, { token: S.agentB.token }), [403, 404], 'read: ');
    assertStatus(await api('POST', `/conversations/${conversationId}/messages`, { token: S.agentB.token, json: { messageText: 'intruder' } }), [403, 404], 'write: ');
  });
  await check('BUYER message -> AGENT A reply -> buyer sees the reply', async () => {
    assertStatus(await api('POST', `/conversations/${conversationId}/messages`, { token: S.buyer.token, json: { messageText: 'Smoke buyer message' } }), 201, 'buyer msg: ');
    assertStatus(await api('POST', `/conversations/${conversationId}/messages`, { token: S.agentA.token, json: { messageText: 'Smoke agent reply' } }), 201, 'agent reply: ');
    const res = await api('GET', `/conversations/${conversationId}/messages`, { token: S.buyer.token });
    assertStatus(res, 200);
    assert(res.text.includes('Smoke agent reply'), 'buyer cannot see the agent reply');
  });

  // appointment with an explicit +05:00 offset; DB must hold the UTC digits
  const startUtc = new Date(Date.now() + 3 * 86400000); startUtc.setUTCSeconds(0, 0); startUtc.setUTCMinutes(Math.floor(startUtc.getUTCMinutes() / 10) * 10 + 7);
  const local = new Date(startUtc.getTime() + 5 * 3600000).toISOString().slice(0, 19);
  const expectedUtc = startUtc.toISOString().slice(0, 19).replace('T', ' ');
  let appointmentId = null;
  await check("AGENT A cannot request a viewing on their own listing -> 403 OWN_LISTING", async () => {
    assertStatus(await api('POST', '/appointments', { token: S.agentA.token, json: { propertyId: id, scheduledAt: `${local}+05:00`, durationMinutes: 30 } }), 403);
  });
  await check('appointment without a timezone offset is rejected (422)', async () => {
    assertStatus(await api('POST', '/appointments', { token: S.buyer.token, json: { propertyId: id, scheduledAt: local, durationMinutes: 30 } }), [400, 422]);
  });
  await check(`BUYER requests a viewing at ${local}+05:00 -> stored as UTC ${expectedUtc}`, async () => {
    const res = await api('POST', '/appointments', { token: S.buyer.token, json: { propertyId: id, scheduledAt: `${local}+05:00`, durationMinutes: 30, notes: 'smoke' } });
    assertStatus(res, 201);
    appointmentId = data(res).appointment.appointment_id;
    const { rows: [row] } = await pool.query('SELECT scheduled_at FROM appointments WHERE appointment_id = $1', [appointmentId]);
    assert(String(row.scheduled_at).slice(0, 19) === expectedUtc, `DB has ${row.scheduled_at}, expected ${expectedUtc}`);
    const api_at = String(data(res).appointment.scheduled_at).slice(0, 19).replace('T', ' ');
    assert(api_at === expectedUtc, `API returned ${data(res).appointment.scheduled_at}, expected UTC ${expectedUtc}`);
  });
  await check('BUYER cannot confirm their own request; AGENT B cannot confirm; AGENT A can -> 200', async () => {
    assertStatus(await api('PUT', `/appointments/${appointmentId}/status`, { token: S.buyer.token, json: { status: 'confirmed' } }), [403, 409], 'buyer: ');
    assertStatus(await api('PUT', `/appointments/${appointmentId}/status`, { token: S.agentB.token, json: { status: 'confirmed' } }), 403, 'agent B: ');
    assertStatus(await api('PUT', `/appointments/${appointmentId}/status`, { token: S.agentA.token, json: { status: 'confirmed' } }), 200, 'agent A: ');
  });
  await check('BUYER sees the confirmed appointment', async () => {
    const res = await api('GET', '/appointments/me', { token: S.buyer.token });
    assertStatus(res, 200);
    const mine = (data(res).appointments || []).find((a) => a.appointment_id === appointmentId);
    assert(mine && mine.status === 'confirmed', `status is ${mine && mine.status}`);
  });
}

async function s6_suspensionAndReset() {
  // Ordered so the buyer's flows above are done; reset first, then suspension.
  section('6. Password reset (real PostgreSQL token rows)');
  const email = S.buyer.email;
  let genericBody = null;
  await check('forgot-password: existing vs unknown email -> identical status and body (non-enumerating)', async () => {
    const known = await api('POST', '/auth/forgot-password', { json: { email } });
    const unknown = await api('POST', '/auth/forgot-password', { json: { email: `smoke.${RUN_ID}.nobody@${EMAIL_DOMAIN}` } });
    assertStatus(known, 200, 'known: ');
    assertStatus(unknown, 200, 'unknown: ');
    assert(JSON.stringify(known.body) === JSON.stringify(unknown.body), 'response bodies differ between known and unknown email');
    genericBody = known.body;
  });
  await check('forgot-password stored a HASHED token that expires in ~30 minutes (EXTRACT(EPOCH) check)', async () => {
    const { rows } = await pool.query('SELECT token_hash, used_at, EXTRACT(EPOCH FROM expires_at) - EXTRACT(EPOCH FROM NOW()) AS secs_left FROM password_reset_tokens WHERE user_id = $1 ORDER BY reset_token_id DESC LIMIT 1', [S.buyer.id]);
    assert(rows.length === 1, 'no reset token row created (is Gmail configured? the row is created before sending, so this is a real failure)');
    assert(/^[0-9a-f]{64}$/.test(rows[0].token_hash), 'token_hash is not a sha-256 hex digest');
    assert(rows[0].used_at === null, 'fresh token is already marked used');
    const s = Number(rows[0].secs_left);
    assert(s > 28 * 60 && s <= 30 * 60 + 5, `expiry is ${Math.round(s / 60)} min away, expected ~30 (timezone bug?)`);
  });

  // Tokens we mint ourselves (the emailed raw token is not retrievable): same hashing + model as the app.
  const rawGood = generateSecureToken();
  const rawExpired = generateSecureToken();
  await passwordResetTokenModel.insertToken({ userId: S.buyer.id, tokenHash: hashToken(rawGood), expiresInMinutes: 30 });
  await passwordResetTokenModel.insertToken({ userId: S.buyer.id, tokenHash: hashToken(rawExpired), expiresInMinutes: -5 });

  await check('expired reset token (-5 min) is rejected -> 400', async () => {
    assertStatus(await api('POST', '/auth/reset-password', { json: { token: rawExpired, newPassword: NEW_PASSWORD } }), 400);
  });
  await check('valid reset token -> 200; password changes; login with NEW password works', async () => {
    assertStatus(await api('POST', '/auth/reset-password', { json: { token: rawGood, newPassword: NEW_PASSWORD } }), 200, 'reset: ');
    const login = await api('POST', '/auth/login', { json: { email, password: NEW_PASSWORD } });
    assertStatus(login, 200, 'login with new password: ');
    S.buyer.password = NEW_PASSWORD;
    const d = data(login);
    S.buyer.token = d.accessToken;
    const c = cookieValue(login.setCookies); S.buyer.cookie = c ? c.value : S.buyer.cookie;
  });
  await check('reset token is single-use: replay -> 400', async () => {
    assertStatus(await api('POST', '/auth/reset-password', { json: { token: rawGood, newPassword: 'Another-Pass-9999!' } }), 400);
  });
  await check('reset revoked older sessions: pre-reset refresh cookie -> 401', async () => {
    if (!S.buyer.rotatedCookie) return { skip: 'no pre-reset cookie captured' };
    assertStatus(await api('POST', '/auth/refresh', { cookie: S.buyer.rotatedCookie }), 401);
  });
  return genericBody;
}

async function s7_suspension() {
  section('7. Account suspension');
  if (!S.admin.token) {
    record(currentSection, 'suspend buyer -> old access token, refresh and login all stop', 'SKIP', 'no admin credentials');
    return;
  }
  await check('ADMIN suspends the buyer -> 200 (needs super_admin)', async () => {
    const res = await api('PUT', `/admin/users/${S.buyer.id}/status`, { token: S.admin.token, json: { status: 'suspended' } });
    assertStatus(res, 200, 'suspend (403 means this admin is not super_admin): ');
    S.suspended = true;
  });
  if (!S.suspended) return;
  await check('suspended buyer: EXISTING access token stops working immediately (/auth/me, /favorites -> 401)', async () => {
    assertStatus(await api('GET', '/auth/me', { token: S.buyer.token }), 401, '/auth/me: ');
    assertStatus(await api('GET', '/favorites', { token: S.buyer.token }), 401, '/favorites: ');
  });
  await check('suspended buyer cannot log in or refresh', async () => {
    const login = await api('POST', '/auth/login', { json: { email: S.buyer.email, password: S.buyer.password } });
    assertStatus(login, [401, 403], 'login: ');
    const refresh = await api('POST', '/auth/refresh', { cookie: S.buyer.cookie });
    assertStatus(refresh, [401, 403], 'refresh: ');
  });
  await check('ADMIN reactivates the buyer; the same access token works again', async () => {
    assertStatus(await api('PUT', `/admin/users/${S.buyer.id}/status`, { token: S.admin.token, json: { status: 'active' } }), 200, 'reactivate: ');
    assertStatus(await api('GET', '/auth/me', { token: S.buyer.token }), 200, '/auth/me: ');
  });
}

async function s8_documentsAndUploads() {
  section('8. Private documents and upload security');
  let documentId = null; let documentUrl = null;
  await check('BUYER cannot upload a verification document -> 403', async () => {
    assertStatus(await api('POST', '/verification/documents', { token: S.buyer.token, form: fileForm('document', PDF_MIN, 'l.pdf', 'application/pdf', { documentType: 'license' }) }), 403);
  });
  await check('AGENT A uploads a license PDF -> 201', async () => {
    const res = await api('POST', '/verification/documents', { token: S.agentA.token, form: fileForm('document', PDF_MIN, 'license.pdf', 'application/pdf', { documentType: 'license' }) });
    assertStatus(res, 201);
    documentId = data(res).documentId;
    const me = await api('GET', '/verification/me', { token: S.agentA.token });
    documentUrl = findUploadUrl(me.body, '/uploads/documents/');
    assert(documentUrl, 'stored document url not found in /verification/me');
    assert(/^\/uploads\/documents\/[0-9a-f]{32}\.pdf$/.test(documentUrl), `stored name is not random/safe: ${documentUrl}`);
  });
  const fileUrl = () => `/verification/documents/${documentId}/file`;
  await check('document file: owner 200 (real PDF bytes), unauth 401, buyer 403, other agent 404', async () => {
    const owner = await fetch(`${BASE}${fileUrl()}`, { headers: { Authorization: `Bearer ${S.agentA.token}` } });
    assert(owner.status === 200, `owner got ${owner.status}`);
    const bytes = Buffer.from(await owner.arrayBuffer());
    assert(bytes.subarray(0, 5).toString('latin1') === '%PDF-', 'owner did not receive the PDF bytes');
    assertStatus(await api('GET', fileUrl()), 401, 'unauth: ');
    assertStatus(await api('GET', fileUrl(), { token: S.buyer.token }), 403, 'buyer: ');
    assertStatus(await api('GET', fileUrl(), { token: S.agentB.token }), 404, 'agent B: ');
  });
  await check('document file: admin can read it (200)', async () => {
    if (!S.admin.token) return { skip: 'no admin credentials' };
    assertStatus(await api('GET', fileUrl(), { token: S.admin.token }), 200);
  });
  await check('document is NOT publicly served: GET /uploads/documents/<name> and directory -> 404', async () => {
    const direct = await rawGet(documentUrl);
    assert(direct.status !== 200 && !direct.body.startsWith('%PDF-'), `direct URL returned ${direct.status}`);
    const dir = await rawGet('/uploads/documents/');
    assert(dir.status !== 200, `directory listing returned ${dir.status}`);
  });
  await check('AGENT B cannot delete agent A\'s document (404) and file remains', async () => {
    assertStatus(await api('DELETE', `/verification/documents/${documentId}`, { token: S.agentB.token }), [403, 404]);
    assert(listUploadFiles('documents').includes(documentUrl.split('/').pop()), 'document file vanished');
  });
  await check('disallowed document type (HTML posing as image/png) -> 4xx and nothing stored', async () => {
    const before = listUploadFiles('documents').length;
    const res = await api('POST', '/verification/documents', { token: S.agentA.token, form: fileForm('document', Buffer.from('<html><script>alert(1)</script></html>'), 'evil.png', 'image/png', { documentType: 'license' }) });
    assertStatus(res, [400, 415, 422]);
    assert(listUploadFiles('documents').length === before, 'a file was written');
  });

  // property images (owner = agent A)
  const before = listUploadFiles('properties').length;
  await check('spoofed image (text bytes, .png name, image/png type) -> 4xx and nothing stored', async () => {
    const res = await api('POST', `/properties/${S.propertyId}/images`, { token: S.agentA.token, form: fileForm('images', Buffer.from('this is not an image <?php echo 1; ?>'), 'shell.png', 'image/png') });
    assertStatus(res, [400, 415, 422]);
    assert(listUploadFiles('properties').length === before, 'spoofed file was written to disk');
  });
  await check('oversize image (6 MB > 5 MB limit) -> 4xx and nothing stored', async () => {
    const big = Buffer.concat([PNG_1x1.subarray(0, 8), Buffer.alloc(6 * 1024 * 1024)]);
    let detail = '';
    try {
      const res = await api('POST', `/properties/${S.propertyId}/images`, { token: S.agentA.token, form: fileForm('images', big, 'big.png', 'image/png') });
      assertStatus(res, [400, 413, 415, 422]);
    } catch (err) {
      // The server may close the connection as soon as the size limit trips; that is still a rejection.
      if (err instanceof RateLimited || /^expected HTTP/.test(err.message)) throw err;
      detail = `server closed the connection (${err.message}); treated as rejected`;
    }
    assert(listUploadFiles('properties').length === before, 'oversize file was written to disk');
    return { detail };
  });
  let imageUrl = null;
  await check('valid PNG named "photo.php" -> stored with a random SAFE extension (client name never used)', async () => {
    const res = await api('POST', `/properties/${S.propertyId}/images`, { token: S.agentA.token, form: fileForm('images', PNG_1x1, 'photo.php', 'image/png') });
    assertStatus(res, 201);
    imageUrl = findUploadUrl(res.body, '/uploads/properties/');
    assert(imageUrl, 'no stored image url in response');
    assert(/^\/uploads\/properties\/[0-9a-f]{32}\.png$/.test(imageUrl), `unsafe stored name: ${imageUrl}`);
  });
  await check('property images ARE served publicly with an image content-type', async () => {
    const res = await fetch(`${ORIGIN}${imageUrl}`);
    assert(res.status === 200, `got ${res.status}`);
    assert(/^image\//.test(res.headers.get('content-type') || ''), `content-type ${res.headers.get('content-type')}`);
  });
  await check('path traversal via static routes is blocked (../ and encoded variants; no .env / source leak)', async () => {
    const probes = [
      '/uploads/properties/..%2f..%2f.env', '/uploads/properties/..%2f..%2fsrc%2fconfig%2fenv.js',
      '/uploads/properties/%2e%2e/%2e%2e/.env', '/uploads/avatars/..%5c..%5c.env',
      '/uploads/properties/../documents/' + (documentUrl || '').split('/').pop(), '/uploads/../.env', '/uploads/documents/' + (documentUrl || '').split('/').pop(),
    ];
    for (const p of probes) {
      const r = await rawGet(p);
      assert(r.status !== 200, `${p} -> 200`);
      assert(!/JWT_ACCESS_SECRET|DATABASE_URL|module\.exports|%PDF-/.test(r.body), `${p} leaked file content`);
    }
  });
  await check('archive the smoke test property (cleanup)', async () => {
    assertStatus(await api('DELETE', `/properties/${S.propertyId}`, { token: S.agentA.token }), 200);
  });
}

async function s9_timezone() {
  section('9. Timezone verification on REAL PostgreSQL (TIMESTAMPTZ columns, exact app SQL)');

  // Dedicated connections (not the app pool) so each can run under a different session TimeZone.
  const connect = async (zone) => {
    const c = new PgClient({ connectionString: env.db.url, ...(env.db.ssl ? { ssl: env.db.ssl } : {}) });
    await c.connect();
    await c.query(`SET TIME ZONE '${zone}'`); // zone comes from the fixed list below, never user input
    return c;
  };

  for (const zone of ['UTC', 'Asia/Karachi', 'America/New_York']) {
    await check(`session ${zone}: reset-token SQL and refresh-token SQL (NOW()+interval / to_timestamp) valid ~30 min, expired ones rejected`, async () => {
      const conn = await connect(zone);
      try {
        await conn.query('CREATE TEMPORARY TABLE tz_check (label TEXT PRIMARY KEY, expires_at TIMESTAMPTZ NOT NULL)');
        // exact expressions used by passwordResetToken.model.js and refreshToken.model.js
        await conn.query(`INSERT INTO tz_check VALUES
          ('reset_ok',        NOW() + (1800::double precision * INTERVAL '1 second')),
          ('reset_expired',   NOW() + (-300::double precision * INTERVAL '1 second')),
          ('refresh_ok',      to_timestamp((EXTRACT(EPOCH FROM NOW()) + 1800)::double precision)),
          ('refresh_expired', to_timestamp((EXTRACT(EPOCH FROM NOW()) - 300)::double precision))`);
        const { rows } = await conn.query(`SELECT label,
            (expires_at > NOW()) AS gt_now,
            EXTRACT(EPOCH FROM expires_at) - EXTRACT(EPOCH FROM NOW()) AS secs
          FROM tz_check`);
        const by = Object.fromEntries(rows.map((r) => [r.label, r]));
        assert(by.reset_ok.gt_now === true, 'reset token valid within window should compare as valid');
        assert(by.reset_expired.gt_now === false, 'expired reset token compared as still valid');
        assert(by.refresh_ok.gt_now === true, 'refresh token valid within window should compare as valid');
        assert(by.refresh_expired.gt_now === false, 'expired refresh token compared as still valid');
        assert(Math.abs(Number(by.reset_ok.secs) - 1800) <= 5 && Math.abs(Number(by.refresh_ok.secs) - 1800) <= 5, `absolute expiry off: reset ${by.reset_ok.secs}s, refresh ${by.refresh_ok.secs}s (expected ~1800)`);
        return { detail: `reset ${Math.round(by.reset_ok.secs)}s / refresh ${Math.round(by.refresh_ok.secs)}s left` };
      } finally { await conn.end(); }
    });
  }
  await check('pool returns timestamptz as UTC "YYYY-MM-DD HH:MM:SS" strings (API format) whatever the session zone', async () => {
    const { rows: [r] } = await pool.query("SELECT TIMESTAMPTZ '2026-01-01 05:30:00+05:30' AS t");
    assert(r.t === '2026-01-01 00:00:00', `got ${r.t}, expected 2026-01-01 00:00:00`);
  });
  await check('app model round-trip: password-reset token +30 valid / -5 expired via passwordResetToken.model', async () => {
    if (!S.agentA.id) return { skip: 'agent A registration did not complete earlier in this run (see section 1)' };
    const good = hashToken(generateSecureToken()); const stale = hashToken(generateSecureToken());
    try {
      await passwordResetTokenModel.insertToken({ userId: S.agentA.id, tokenHash: good, expiresInMinutes: 30 });
      await passwordResetTokenModel.insertToken({ userId: S.agentA.id, tokenHash: stale, expiresInMinutes: -5 });
      assert(await passwordResetTokenModel.findValidByHash(good), 'valid token not found as valid');
      assert(!(await passwordResetTokenModel.findValidByHash(stale)), 'expired token found as valid');
    } finally { await pool.query('DELETE FROM password_reset_tokens WHERE token_hash IN ($1, $2)', [good, stale]); }
  });
  await check('app model round-trip: refresh token +30 min valid / -5 min expired via refreshToken.model', async () => {
    if (!S.agentA.id) return { skip: 'agent A registration did not complete earlier in this run (see section 1)' };
    const good = hashToken(generateSecureToken()); const stale = hashToken(generateSecureToken());
    const now = Math.floor(Date.now() / 1000);
    try {
      await refreshTokenModel.insertToken(pool, { userId: S.agentA.id, tokenHash: good, expiresAtUnixSeconds: now + 1800 });
      await refreshTokenModel.insertToken(pool, { userId: S.agentA.id, tokenHash: stale, expiresAtUnixSeconds: now - 300 });
      assert(await refreshTokenModel.findValidByHash(good), 'valid refresh token not found as valid');
      assert(!(await refreshTokenModel.findValidByHash(stale)), 'expired refresh token found as valid (timezone skew?)');
    } finally { await pool.query('DELETE FROM refresh_tokens WHERE token_hash IN ($1, $2)', [good, stale]); }
  });
  await check('column types: appointments.scheduled_at is TIMESTAMP (UTC digits), token expiries are TIMESTAMPTZ', async () => {
    const { rows } = await pool.query("SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND ((table_name = 'appointments' AND column_name = 'scheduled_at') OR (table_name IN ('refresh_tokens','password_reset_tokens') AND column_name = 'expires_at'))");
    const by = Object.fromEntries(rows.map((c) => [`${c.table_name}.${c.column_name}`, c.data_type]));
    assert(by['appointments.scheduled_at'] === 'timestamp without time zone', `appointments.scheduled_at is ${by['appointments.scheduled_at']}`);
    assert(by['refresh_tokens.expires_at'] === 'timestamp with time zone', `refresh_tokens.expires_at is ${by['refresh_tokens.expires_at']}`);
    assert(by['password_reset_tokens.expires_at'] === 'timestamp with time zone', `password_reset_tokens.expires_at is ${by['password_reset_tokens.expires_at']}`);
    return { info: rows.map((c) => `${c.table_name}.${c.column_name}=${c.data_type}`).join(', ') };
  });
}

async function s10_secretsAndStatic() {
  section('10. Secrets must not reach the frontend');
  await check('no backend secret value appears in estatehub-react/src or estatehub-react/dist (values never printed)', async () => {
    const dbPassword = (() => { try { return decodeURIComponent(new URL(env.db.url).password); } catch (err) { return ''; } })();
    const secrets = [env.jwt.accessSecret, env.jwt.refreshSecret, dbPassword, env.db.url, process.env.GMAIL_PASS].filter((v) => v && v.length >= 8);
    const root = path.join(__dirname, '..', '..', '..', 'estatehub-react');
    const dirs = ['src', 'dist', 'public'].map((d) => path.join(root, d)).filter((d) => fs.existsSync(d));
    if (dirs.length === 0) return { skip: 'estatehub-react folder not found next to estatehub-backend' };
    let scanned = 0; const hits = [];
    const walk = (dir) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) { walk(p); continue; }
        if (!/\.(js|jsx|css|html|json|map|txt|svg)$/i.test(ent.name)) continue;
        scanned += 1;
        const text = fs.readFileSync(p, 'utf8');
        secrets.forEach((s, i) => { if (text.includes(s)) hits.push(`secret#${i + 1} in ${path.relative(root, p)}`); });
      }
    };
    dirs.forEach(walk);
    assert(hits.length === 0, `secret value found: ${hits.join('; ')}`);
    return { detail: `${scanned} files scanned in ${dirs.map((d) => path.basename(d)).join(', ')}${dirs.some((d) => d.endsWith('dist')) ? '' : ' (no dist folder: run npm run build and re-run to scan the bundle)'}` };
  });
}

// ------------------------------------------------------------------ main

// The real orchestration (kept separate so a crash in one section never hides earlier results)
async function run() {
  console.log(`EstateHub live smoke test — run ${RUN_ID}`);
  console.log(`API: ${BASE}   admin credentials: ${adminCreds ? 'provided' : 'NOT provided (admin checks will SKIP)'}`);
  console.log('A result only counts if it was printed by this run against your system.');
  const steps = [s0_preflight];
  let userSectionsOk = true;
  for (const step of steps) await safely(step);
  const health = results.find((r) => r.name.startsWith('backend reachable'));
  if (!health || health.status !== 'PASS') { console.log('\nBackend not reachable — aborting.'); return report(); }

  await safely(s1_auth);
  userSectionsOk = Boolean(S.buyer.token && S.agentA.token && S.agentB.token);
  if (!userSectionsOk) {
    console.log('\nUser registration did not complete (rate limit or validation) — skipping user-based sections.');
  } else {
    for (const step of [s2_refresh, s3_authorization, s4_propertyOwnership, s5_crossRoleFlow, s6_suspensionAndReset, s7_suspension, s8_documentsAndUploads]) {
      await safely(step);
    }
  }
  await safely(s9_timezone);
  await safely(s10_secretsAndStatic);
  return report();
}

async function safely(step) {
  try { await step(); } catch (err) { record(currentSection || step.name, `section aborted (${step.name})`, 'FAIL', describeError(err)); }
}

async function report() {
  const count = (s) => results.filter((r) => r.status === s).length;
  console.log('\n================ SUMMARY ================');
  console.log(`PASS ${count('PASS')}   FAIL ${count('FAIL')}   BLOCKED ${count('BLOCKED')}   SKIP ${count('SKIP')}   INFO ${count('INFO')}`);
  console.log(`Auth-rate-limited calls used this run: ${authLimitedCalls} of 20 per 15 min`);
  results.filter((r) => r.status === 'FAIL').forEach((r) => console.log(`  FAIL: [${r.section}] ${r.name} — ${r.detail}`));
  results.filter((r) => r.status === 'BLOCKED').forEach((r) => console.log(`  BLOCKED: [${r.section}] ${r.name}`));
  console.log('\nCleanup (run manually in PostgreSQL if you want the smoke data gone; review before running):');
  console.log(`  DELETE FROM users WHERE email LIKE 'smoke.${RUN_ID}.%@${EMAIL_DOMAIN}';   -- or every run: LIKE 'smoke.%@${EMAIL_DOMAIN}'`);
  console.log('  (dependent rows are removed only if your foreign keys cascade; otherwise delete children first or leave the accounts suspended.)');
  if (process.env.SMOKE_REPORT) {
    fs.writeFileSync(process.env.SMOKE_REPORT, JSON.stringify({ runId: RUN_ID, base: BASE, at: new Date().toISOString(), results }, null, 2));
    console.log(`Report written to ${process.env.SMOKE_REPORT}`);
  }
  await pool.end().catch(() => {});
  process.exit(count('FAIL') > 0 ? 1 : 0);
}

run().catch(async (err) => {
  console.error('Fatal:', err);
  await pool.end().catch(() => {});
  process.exit(1);
});
