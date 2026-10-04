// COMPATIBILITY test for src/utils/password.js against the REAL `bcrypt` package (the auth tests stub it out).
// Purpose: after any bcrypt upgrade, prove that (1) hashes already stored in the database still verify, and
// (2) new hashes keep the same format and cost (12). Nothing here weakens SALT_ROUNDS.
//
// If the `bcrypt` native module is not installed/loadable (e.g. a sandbox without network), the tests are reported
// as SKIPPED with the reason — they are never silently counted as passed. Run `npm install` and re-run `npm test`.
const test = require('node:test');
const assert = require('node:assert/strict');

let bcrypt = null;
let loadError = null;
try {
  bcrypt = require('bcrypt');
} catch (err) {
  loadError = err.message.split('\n')[0];
}
const skip = bcrypt ? false : `bcrypt is not loadable here (${loadError}); run npm install, then npm test`;

// Published bcrypt test vector (OpenBSD / jBCrypt suite): password "U*U", fixed salt, cost 5, $2a$ prefix.
// It stands in for "a hash created by an older/other bcrypt implementation": every conforming version must verify it.
const LEGACY = { password: 'U*U', hash: '$2a$05$CCCCCCCCCCCCCCCCCCCCC.E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW' };

test('a pre-existing $2a$ bcrypt hash still verifies, and a wrong password is rejected', { skip }, async () => {
  const { comparePassword } = require('../src/utils/password');
  assert.equal(await comparePassword(LEGACY.password, LEGACY.hash), true);
  assert.equal(await comparePassword('U*V', LEGACY.hash), false);
});

test('hashPassword keeps the existing format and cost: $2b$12$ + 53 chars, and round-trips', { skip }, async () => {
  const { hashPassword, comparePassword } = require('../src/utils/password');
  const hash = await hashPassword('Correct-Horse-Battery-1');
  assert.match(hash, /^\$2[ab]\$12\$[./A-Za-z0-9]{53}$/);
  assert.equal(hash.length, 60);
  assert.equal(await comparePassword('Correct-Horse-Battery-1', hash), true);
  assert.equal(await comparePassword('correct-horse-battery-1', hash), false);
});

test('hashing is salted: the same password produces different hashes that both verify', { skip }, async () => {
  const { hashPassword, comparePassword } = require('../src/utils/password');
  const [a, b] = await Promise.all([hashPassword('same-password-1'), hashPassword('same-password-1')]);
  assert.notEqual(a, b);
  assert.equal(await comparePassword('same-password-1', a), true);
  assert.equal(await comparePassword('same-password-1', b), true);
});

test('the bcrypt cost factor in password.js is still 12 (not weakened)', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'src', 'utils', 'password.js'), 'utf8');
  assert.match(src, /SALT_ROUNDS\s*=\s*12\b/);
});
