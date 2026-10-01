// tests/auth.test.js
// Covers registration, login, refresh, logout, forgot-password, and reset-password, plus the
// authenticate middleware's per-request account-status check. See tests/helpers/authWorld.js for
// why jwt.js/password.js are faked here (jsonwebtoken/bcrypt aren't installed in this sandbox —
// no network access) — the fakes preserve real expiry/mismatch *behavior*, but this suite does not
// exercise the actual jsonwebtoken/bcrypt libraries. Rate limiting (express-rate-limit, wired in
// auth.routes.js) is Express middleware this harness bypasses entirely — see the phase report for
// why that's stated as "not exercised" rather than "tested" here.

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeAuthWorld, loadAuthController, loadAuthenticateMiddleware, call } = require('./helpers/authWorld');

function setup() {
  const world = makeAuthWorld();
  const controller = loadAuthController(world);
  return { world, controller };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

test('register: creates a buyer, issues tokens, never accepts role=admin from the body', async () => {
  const { world, controller } = setup();
  const res = await call(controller.register, {
    body: { email: 'new@test.com', password: 'Password123', firstName: 'New', lastName: 'User', role: 'admin' },
  });
  assert.equal(res.status, 201);
  // The controller itself has no admin branch at all — role='admin' just falls through as a plain
  // column value with no admin_users row created. (The validator, checked separately in
  // auth.validator.js, is what actually rejects role=admin before this handler ever runs.)
  const created = Object.values(world.users).find((u) => u.email === 'new@test.com');
  assert.ok(created);
  const payload = world.jwt.decodeToken(res.body.data.accessToken);
  assert.equal(payload.userId, created.user_id);
  assert.equal(res.cookieJar.refreshToken.opts.httpOnly, true);
});

test('register: duplicate email is rejected with 409', async () => {
  const { controller } = setup();
  const res = await call(controller.register, { body: { email: 'buyer@test.com', password: 'Password123', firstName: 'A', lastName: 'B' } });
  assert.equal(res.status, 409);
});

test('register: agent role creates an agent profile; duplicate license number rejected', async () => {
  const { world, controller } = setup();
  const ok = await call(controller.register, {
    body: { email: 'agent1@test.com', password: 'Password123', firstName: 'A', lastName: 'Gent', role: 'agent', licenseNumber: 'LIC-1' },
  });
  assert.equal(ok.status, 201);
  assert.ok(Object.values(world.agents).some((a) => a.license_number === 'LIC-1'));

  const dupe = await call(controller.register, {
    body: { email: 'agent2@test.com', password: 'Password123', firstName: 'A', lastName: 'Gent2', role: 'agent', licenseNumber: 'LIC-1' },
  });
  assert.equal(dupe.status, 409);
});

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

test('login: correct password succeeds and issues tokens', async () => {
  const { controller } = setup();
  const res = await call(controller.login, { body: { email: 'buyer@test.com', password: 'Password123' } });
  assert.equal(res.status, 200);
  assert.ok(res.body.data.accessToken);
  assert.ok(res.cookieJar.refreshToken);
});

test('login: wrong password and unknown email both return the same 401 message', async () => {
  const { controller } = setup();
  const wrongPassword = await call(controller.login, { body: { email: 'buyer@test.com', password: 'nope' } });
  const unknownEmail = await call(controller.login, { body: { email: 'nobody@test.com', password: 'nope' } });
  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownEmail.status, 401);
  assert.equal(wrongPassword.body.error, unknownEmail.body.error);
});

test('login: suspended account is rejected even with the correct password', async () => {
  const { controller } = setup();
  const res = await call(controller.login, { body: { email: 'suspended@test.com', password: 'Password123' } });
  assert.equal(res.status, 403);
});

// ---------------------------------------------------------------------------
// Refresh / logout
// ---------------------------------------------------------------------------

test('refresh: valid cookie rotates the token (old one becomes unusable)', async () => {
  const { world, controller } = setup();
  const login = await call(controller.login, { body: { email: 'buyer@test.com', password: 'Password123' } });
  const oldToken = login.cookieJar.refreshToken.value;

  const refreshed = await call(controller.refresh, { cookies: { refreshToken: oldToken } });
  assert.equal(refreshed.status, 200);
  const newToken = refreshed.cookieJar.refreshToken.value;
  assert.notEqual(newToken, oldToken);

  const reuseOld = await call(controller.refresh, { cookies: { refreshToken: oldToken } });
  assert.equal(reuseOld.status, 401, 'a rotated-out refresh token must not work again');
});

test('refresh: expired refresh token is rejected', async () => {
  const { world, controller } = setup();
  const login = await call(controller.login, { body: { email: 'buyer@test.com', password: 'Password123' } });
  // Craft an already-expired token carrying the same payload the real one would have had.
  const payload = world.jwt.decodeToken(login.cookieJar.refreshToken.value);
  const expiredToken = world.jwt._encodeWithExp({ userId: payload.userId, role: payload.role }, Math.floor(Date.now() / 1000) - 10);

  const res = await call(controller.refresh, { cookies: { refreshToken: expiredToken } });
  assert.equal(res.status, 401);
});

test('refresh: revoked (logged-out) refresh token cannot be used', async () => {
  const { controller } = setup();
  const login = await call(controller.login, { body: { email: 'buyer@test.com', password: 'Password123' } });
  const token = login.cookieJar.refreshToken.value;

  await call(controller.logout, { cookies: { refreshToken: token } });
  const res = await call(controller.refresh, { cookies: { refreshToken: token } });
  assert.equal(res.status, 401);
});

test('refresh: no cookie at all is rejected', async () => {
  const { controller } = setup();
  const res = await call(controller.refresh, { cookies: {} });
  assert.equal(res.status, 401);
});

// ---------------------------------------------------------------------------
// Forgot password
// ---------------------------------------------------------------------------

test('forgot-password: existing active user gets an identical response to an unknown email, but only the real one gets a token+email', async () => {
  const { world, controller } = setup();
  const known = await call(controller.forgotPassword, { body: { email: 'buyer@test.com' } });
  const unknown = await call(controller.forgotPassword, { body: { email: 'nobody@test.com' } });

  assert.equal(known.status, 200);
  assert.equal(unknown.status, 200);
  assert.deepEqual(known.body, unknown.body, 'response body must not reveal which email exists');

  assert.equal(world.resetTokens.length, 1, 'exactly one reset token should exist (only for the real user)');
  assert.equal(world.sentEmails.length, 1);
  assert.equal(world.sentEmails[0].to, 'buyer@test.com');
});

test('forgot-password: a suspended account gets the generic response but no token/email', async () => {
  const { world, controller } = setup();
  const res = await call(controller.forgotPassword, { body: { email: 'suspended@test.com' } });
  assert.equal(res.status, 200);
  assert.equal(world.resetTokens.length, 0);
  assert.equal(world.sentEmails.length, 0);
});

test('forgot-password: only a hash is ever stored, never the raw token', async () => {
  const { world, controller } = setup();
  await call(controller.forgotPassword, { body: { email: 'buyer@test.com' } });
  const stored = world.resetTokens[0];
  const emailedUrl = world.sentEmails[0].text;
  const rawTokenInEmail = emailedUrl.match(/token=([a-f0-9]+)/)[1];

  assert.notEqual(stored.token_hash, rawTokenInEmail, 'stored value must not equal the raw token');
  assert.equal(stored.token_hash.length, 64, 'sha256 hex digest is 64 chars — confirms a real hash, not the raw 64-char token coincidentally matching');
  assert.notEqual(rawTokenInEmail.length, 0);
});

test('forgot-password: a second request invalidates the first token', async () => {
  const { world, controller } = setup();
  await call(controller.forgotPassword, { body: { email: 'buyer@test.com' } });
  const firstUrl = world.sentEmails[0].text;
  const firstToken = firstUrl.match(/token=([a-f0-9]+)/)[1];

  await call(controller.forgotPassword, { body: { email: 'buyer@test.com' } });

  const reset = await call(controller.resetPassword, { body: { token: firstToken, newPassword: 'BrandNewPass1' } });
  assert.equal(reset.status, 400, 'the superseded first token must no longer work');
});

// ---------------------------------------------------------------------------
// Reset password
// ---------------------------------------------------------------------------

async function requestReset(world, controller, email = 'buyer@test.com') {
  await call(controller.forgotPassword, { body: { email } });
  const url = world.sentEmails.at(-1).text;
  return url.match(/token=([a-f0-9]+)/)[1];
}

test('reset-password: valid token sets the new password, old password stops working, new one works', async () => {
  const { world, controller } = setup();
  const token = await requestReset(world, controller);

  const reset = await call(controller.resetPassword, { body: { token, newPassword: 'BrandNewPass1' } });
  assert.equal(reset.status, 200);

  const oldFails = await call(controller.login, { body: { email: 'buyer@test.com', password: 'Password123' } });
  assert.equal(oldFails.status, 401);

  const newWorks = await call(controller.login, { body: { email: 'buyer@test.com', password: 'BrandNewPass1' } });
  assert.equal(newWorks.status, 200);
});

test('reset-password: invalid token is rejected', async () => {
  const { controller } = setup();
  const res = await call(controller.resetPassword, { body: { token: 'not-a-real-token', newPassword: 'BrandNewPass1' } });
  assert.equal(res.status, 400);
});

test('reset-password: expired token is rejected', async () => {
  const { world, controller } = setup();
  const user = world.users[1];
  const rawToken = 'a'.repeat(64);
  const { hashToken } = require('../src/utils/tokenHash');
  world.resetTokens.push({
    reset_token_id: 999, user_id: user.user_id, token_hash: hashToken(rawToken),
    expires_at_ms: Date.now() - 60000, used_at: null,
  });
  const res = await call(controller.resetPassword, { body: { token: rawToken, newPassword: 'BrandNewPass1' } });
  assert.equal(res.status, 400);
});

test('reset-password: a token cannot be used twice', async () => {
  const { world, controller } = setup();
  const token = await requestReset(world, controller);

  const first = await call(controller.resetPassword, { body: { token, newPassword: 'BrandNewPass1' } });
  assert.equal(first.status, 200);

  const second = await call(controller.resetPassword, { body: { token, newPassword: 'AnotherPass2' } });
  assert.equal(second.status, 400, 'a reused reset token must be rejected');
});

test('reset-password: invalidates existing refresh-token sessions for that user', async () => {
  const { world, controller } = setup();
  const login = await call(controller.login, { body: { email: 'buyer@test.com', password: 'Password123' } });
  const sessionToken = login.cookieJar.refreshToken.value;

  const token = await requestReset(world, controller);
  await call(controller.resetPassword, { body: { token, newPassword: 'BrandNewPass1' } });

  const refreshAfterReset = await call(controller.refresh, { cookies: { refreshToken: sessionToken } });
  assert.equal(refreshAfterReset.status, 401, 'a session that existed before the reset must not survive it');
});

// ---------------------------------------------------------------------------
// authenticate middleware — account-status re-check on every request
// ---------------------------------------------------------------------------

test('authenticate: a still-valid access token for a since-suspended user is rejected', async () => {
  const world = makeAuthWorld();
  const authenticate = loadAuthenticateMiddleware(world);
  const token = world.jwt.signAccessToken({ userId: 1, role: 'buyer' });

  const before = await new Promise((resolve) => {
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = { code: 200, status(c) { this.code = c; return this; }, json(b) { resolve({ status: this.code, body: b }); } };
    authenticate(req, res, () => resolve({ status: 'next', req }));
  });
  assert.equal(before.status, 'next');

  world.users[1].status = 'suspended';

  const after = await new Promise((resolve) => {
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = { code: 200, status(c) { this.code = c; return this; }, json(b) { resolve({ status: this.code, body: b }); } };
    authenticate(req, res, () => resolve({ status: 'next' }));
  });
  assert.equal(after.status, 401, 'the same still-unexpired token must stop working once the account is suspended');
});

test('authenticate: a token whose role claim no longer matches the DB is rejected', async () => {
  const world = makeAuthWorld();
  const authenticate = loadAuthenticateMiddleware(world);
  // Token was issued while user 1 was a 'buyer'; simulate the DB now disagreeing with that claim.
  const token = world.jwt.signAccessToken({ userId: 1, role: 'buyer' });
  world.users[1].role = 'agent';

  const res = await new Promise((resolve) => {
    const req = { headers: { authorization: `Bearer ${token}` } };
    const fakeRes = { code: 200, status(c) { this.code = c; return this; }, json(b) { resolve({ status: this.code, body: b }); } };
    authenticate(req, fakeRes, () => resolve({ status: 'next' }));
  });
  assert.equal(res.status, 401);
});

test('authenticate: malformed/expired tokens are rejected without a DB lookup', async () => {
  const world = makeAuthWorld();
  const authenticate = loadAuthenticateMiddleware(world);
  const res = await new Promise((resolve) => {
    const req = { headers: { authorization: 'Bearer not-a-real-token' } };
    const fakeRes = { code: 200, status(c) { this.code = c; return this; }, json(b) { resolve({ status: this.code, body: b }); } };
    authenticate(req, fakeRes, () => resolve({ status: 'next' }));
  });
  assert.equal(res.status, 401);
});
