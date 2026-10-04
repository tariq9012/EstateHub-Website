// UNIT tests (no database, no `pg` package needed) for the PostgreSQL adapter helpers in src/config/dbHelpers.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('../src/config/dbHelpers');

test('compileNamed: :names become $1.. in first-use order and values are bound, not interpolated', () => {
  const evil = "x'; DROP TABLE users; --";
  const { text, values } = h.compileNamed('SELECT * FROM users WHERE email = :email AND role = :role', { email: evil, role: 'buyer' });
  assert.equal(text, 'SELECT * FROM users WHERE email = $1 AND role = $2');
  assert.deepEqual(values, [evil, 'buyer']);
  assert.ok(!text.includes('DROP'));
});

test('compileNamed: a repeated name reuses the same $n (one bound value)', () => {
  const { text, values } = h.compileNamed('WHERE a = :id OR b = :id OR c = :other', { id: 7, other: 9 });
  assert.equal(text, 'WHERE a = $1 OR b = $1 OR c = $2');
  assert.deepEqual(values, [7, 9]);
});

test('compileNamed: ::casts, quoted strings/identifiers and comments are not treated as placeholders', () => {
  const sql = `SELECT x::text, 'a:b :c', "col:d" FROM t -- :ignored
    WHERE y = :y /* :nope */ AND z = :z::int`;
  const { text, values } = h.compileNamed(sql, { y: 1, z: '2' });
  assert.ok(text.includes('x::text'));
  assert.ok(text.includes("'a:b :c'"));
  assert.ok(text.includes('"col:d"'));
  assert.ok(text.includes('-- :ignored'));
  assert.ok(text.includes('/* :nope */'));
  assert.ok(text.includes('y = $1'));
  assert.ok(text.includes('z = $2::int'));
  assert.deepEqual(values, [1, '2']);
});

test('compileNamed: doubled quotes inside a string literal do not end the literal early', () => {
  const { text, values } = h.compileNamed("SELECT 'it''s :not' AS s WHERE id = :id", { id: 1 });
  assert.equal(text, "SELECT 'it''s :not' AS s WHERE id = $1");
  assert.deepEqual(values, [1]);
});

test('compileNamed: a missing parameter throws (never silently NULL); undefined is bound as NULL', () => {
  assert.throws(() => h.compileNamed('SELECT :nope', { other: 1 }), /Missing value for SQL parameter :nope/);
  assert.deepEqual(h.compileNamed('SELECT :a', { a: undefined }).values, [null]);
});

test('compileNamed: array / absent params are passed through untouched (plain $1 queries)', () => {
  assert.deepEqual(h.compileNamed('SELECT $1', [5]), { text: 'SELECT $1', values: [5] });
  assert.deepEqual(h.compileNamed('SELECT 1'), { text: 'SELECT 1', values: [] });
});

test('compileNamed: array values (int[] binds) and Date/null are passed as single values', () => {
  const arr = [1, 2, 3];
  const { text, values } = h.compileNamed('SELECT UNNEST(:ids::int[])', { ids: arr });
  assert.equal(text, 'SELECT UNNEST($1::int[])');
  assert.equal(values[0], arr);
});

test('int8 parser: COUNT(*) comes back as a Number (as mysql2 did), huge values stay exact strings', () => {
  assert.equal(h.parseBigint('42'), 42);
  assert.equal(h.parseBigint('9007199254740993'), '9007199254740993');
});

test('timestamp parsers keep the API\'s historical "YYYY-MM-DD HH:MM:SS" (UTC) string format', () => {
  assert.equal(h.parseTimestamp('2026-09-25 10:05:00'), '2026-09-25 10:05:00');
  assert.equal(h.parseTimestamp('2026-09-25 10:05:00.123456'), '2026-09-25 10:05:00');
  assert.equal(h.parseTimestamptz('2026-09-25 10:05:00+00'), '2026-09-25 10:05:00');
  assert.equal(h.parseTimestamptz('2026-09-25 15:05:00.5+05'), '2026-09-25 10:05:00');
  assert.equal(h.parseTimestamptz('2026-09-25 05:05:00-05:00'), '2026-09-25 10:05:00');
  assert.equal(h.parseTimestamptz('2026-09-25 10:05:00+05:30'), '2026-09-25 04:35:00');
  assert.equal(h.parseTimestamptz('infinity'), 'infinity');
  assert.equal(h.parseDate('2026-09-25'), '2026-09-25');
});

test('timestamptz parse is independent of the process TZ', () => {
  const before = process.env.TZ;
  try {
    for (const tz of ['UTC', 'Asia/Karachi', 'America/New_York']) {
      process.env.TZ = tz;
      assert.equal(h.parseTimestamptz('2026-01-01 00:30:00+00'), '2026-01-01 00:30:00', tz);
    }
  } finally {
    if (before === undefined) delete process.env.TZ; else process.env.TZ = before;
  }
});

test('buildTypeParsers overrides only int8/date/timestamp/timestamptz and defers everything else to pg', () => {
  const calls = [];
  const fakePgTypes = { getTypeParser: (oid, format) => { calls.push([oid, format]); return () => `pg-default-${oid}`; } };
  const t = h.buildTypeParsers(fakePgTypes);
  assert.equal(t.getTypeParser(h.OID.INT8)('5'), 5);
  assert.equal(t.getTypeParser(h.OID.TIMESTAMPTZ)('2026-09-25 10:05:00+00'), '2026-09-25 10:05:00');
  assert.equal(t.getTypeParser(1700)('1.50'), 'pg-default-1700'); // NUMERIC stays pg's exact string
  assert.equal(t.getTypeParser(h.OID.INT8, 'binary')(), 'pg-default-20'); // binary format untouched
  assert.deepEqual(calls, [[1700, undefined], [h.OID.INT8, 'binary']]);
});

test('redactDbError never leaks a connection string or password', () => {
  const err = new Error('getaddrinfo failed for postgresql://neondb_owner:S3cr3tPw@ep-x.neon.tech/db?sslmode=require password=S3cr3tPw');
  err.code = 'ENOTFOUND';
  const { code, message } = h.redactDbError(err);
  assert.equal(code, 'ENOTFOUND');
  assert.ok(!message.includes('S3cr3tPw'));
  assert.ok(!message.includes('neondb_owner'));
  assert.ok(message.includes('[redacted-url]'));
});

test('redactDbError unwraps AggregateError (Node tries IPv4+IPv6; ECONNREFUSED is nested)', () => {
  const inner = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' });
  const agg = new AggregateError([inner], '');
  const { code, message } = h.redactDbError(agg);
  assert.equal(code, 'ECONNREFUSED');
  assert.ok(message.includes('ECONNREFUSED'));
});
