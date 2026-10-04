// UNIT tests for src/config/db.js using a FAKE `pg` module and a fake env (no network, no real database).
// They prove transaction handling: BEGIN/COMMIT/ROLLBACK ordering, ONE client for the whole transaction,
// release in every outcome, and :named -> $n binding at the pool boundary.
// They do NOT prove anything about a real PostgreSQL/Neon server.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');

function loadDbWithFakePg(behaviour = {}) {
  const log = { poolQueries: [], clients: [], poolOptions: null, endCalled: false };
  class FakeClient {
    constructor() { this.id = log.clients.length + 1; this.queries = []; this.released = undefined; log.clients.push(this); }
    async query(text, values) {
      this.queries.push({ text, values });
      if (behaviour.failOn && behaviour.failOn(text, this)) throw Object.assign(new Error('boom'), { code: behaviour.failCode });
      return { rows: [{ ok: 1 }], rowCount: 1 };
    }
    // pg semantics: release() / release(false) returns the client to the pool; release(true) destroys it.
    release(arg) { this.released = arg === true ? 'destroyed' : 'returned-to-pool'; }
  }
  class FakePool {
    constructor(opts) { log.poolOptions = opts; this.handlers = {}; }
    on(evt, fn) { this.handlers[evt] = fn; return this; }
    async query(text, values) { log.poolQueries.push({ text, values }); if (behaviour.poolQueryFails) throw behaviour.poolQueryFails; return { rows: [{ n: 1 }], rowCount: 1 }; }
    async connect() { return new FakeClient(); }
    end() { log.endCalled = true; return Promise.resolve(); }
  }
  const fake = (file, exports) => { const f = require.resolve(file); require.cache[f] = { id: f, filename: f, loaded: true, exports, children: [], paths: [] }; };
  // `pg` is not installed in this sandbox; register it under its module name via a resolvable stub path.
  const Module = require('node:module');
  const origResolve = Module._resolveFilename;
  Module._resolveFilename = function (request, ...rest) { return request === 'pg' ? 'pg' : origResolve.call(this, request, ...rest); };
  require.cache.pg = { id: 'pg', filename: 'pg', loaded: true, exports: { Pool: FakePool, types: { getTypeParser: () => (v) => v } }, children: [], paths: [] };
  fake(path.join(SRC, 'config', 'env.js'), { db: { url: 'postgresql://u:p@h/db', ssl: { rejectUnauthorized: true }, poolMax: 3, idleTimeoutMs: 1000, connectTimeoutMs: 2000 } });
  const dbFile = require.resolve(path.join(SRC, 'config', 'db.js'));
  delete require.cache[dbFile];
  const db = require(dbFile);
  Module._resolveFilename = origResolve;
  return { db, log };
}

test('pool is created once with the configured size, TLS verification and timeouts', () => {
  const { log } = loadDbWithFakePg();
  assert.equal(log.poolOptions.max, 3);
  assert.equal(log.poolOptions.connectionString, 'postgresql://u:p@h/db');
  assert.deepEqual(log.poolOptions.ssl, { rejectUnauthorized: true });
  assert.equal(log.poolOptions.idleTimeoutMillis, 1000);
  assert.equal(log.poolOptions.connectionTimeoutMillis, 2000);
  assert.ok(log.poolOptions.types && typeof log.poolOptions.types.getTypeParser === 'function');
});

test('pool.query compiles :named params to $n and returns the pg result unchanged', async () => {
  const { db, log } = loadDbWithFakePg();
  const res = await db.pool.query('SELECT * FROM users WHERE user_id = :id', { id: 5 });
  assert.deepEqual(log.poolQueries[0], { text: 'SELECT * FROM users WHERE user_id = $1', values: [5] });
  assert.deepEqual(res.rows, [{ n: 1 }]);
  assert.equal(res.rowCount, 1);
});

test('withTransaction: BEGIN, statements, COMMIT on ONE client, client released, result returned', async () => {
  const { db, log } = loadDbWithFakePg();
  const out = await db.pool.withTransaction(async (tx) => {
    await tx.query('INSERT INTO a (x) VALUES (:x)', { x: 1 });
    await tx.query('INSERT INTO b (y) VALUES (:y)', { y: 2 });
    return 'done';
  });
  assert.equal(out, 'done');
  assert.equal(log.clients.length, 1);
  const c = log.clients[0];
  assert.deepEqual(c.queries.map((q) => q.text), ['BEGIN', 'INSERT INTO a (x) VALUES ($1)', 'INSERT INTO b (y) VALUES ($1)', 'COMMIT']);
  assert.equal(c.released, 'returned-to-pool');
  assert.equal(log.poolQueries.length, 0, 'transaction statements must not go through the shared pool');
});

test('withTransaction: a throw triggers ROLLBACK (no COMMIT), rethrows the ORIGINAL error, releases the client', async () => {
  const { db, log } = loadDbWithFakePg();
  const original = new Error('business rule failed');
  await assert.rejects(db.pool.withTransaction(async (tx) => { await tx.query('SELECT 1'); throw original; }), (e) => e === original);
  const c = log.clients[0];
  assert.deepEqual(c.queries.map((q) => q.text), ['BEGIN', 'SELECT 1', 'ROLLBACK']);
  assert.equal(c.released, 'returned-to-pool');
});

test('withTransaction: a failing statement (e.g. unique violation 23505) rolls back and keeps its code', async () => {
  const { db, log } = loadDbWithFakePg({ failOn: (t) => t.startsWith('INSERT'), failCode: '23505' });
  await assert.rejects(db.pool.withTransaction((tx) => tx.query('INSERT INTO users (email) VALUES (:e)', { e: 'a' })), (e) => e.code === '23505');
  assert.deepEqual(log.clients[0].queries.map((q) => q.text), ['BEGIN', 'INSERT INTO users (email) VALUES ($1)', 'ROLLBACK']);
  assert.equal(log.clients[0].released, 'returned-to-pool');
});

test('withTransaction: if ROLLBACK itself fails the client is destroyed (release(true)), original error still surfaces', async () => {
  const { db, log } = loadDbWithFakePg({ failOn: (t) => t === 'ROLLBACK' });
  const original = new Error('first failure');
  await assert.rejects(db.pool.withTransaction(async () => { throw original; }), (e) => e === original);
  assert.equal(log.clients[0].released, 'destroyed');
});

test('withTransaction: concurrent transactions each get their own client', async () => {
  const { db, log } = loadDbWithFakePg();
  await Promise.all([1, 2, 3].map((n) => db.pool.withTransaction(async (tx) => { await tx.query('SELECT :n', { n }); })));
  assert.equal(log.clients.length, 3);
  log.clients.forEach((c) => assert.deepEqual(c.queries.map((q) => q.text).filter((t) => ['BEGIN', 'COMMIT'].includes(t)), ['BEGIN', 'COMMIT']));
});

test('testConnection: ok on success; on failure returns a sanitized message (no URL/password)', async () => {
  const good = loadDbWithFakePg();
  assert.deepEqual(await good.db.testConnection(), { ok: true });
  const bad = loadDbWithFakePg({ poolQueryFails: Object.assign(new Error('bad url postgresql://u:topsecret@h/db'), { code: 'ECONNREFUSED' }) });
  const r = await bad.db.testConnection();
  assert.equal(r.ok, false);
  assert.ok(!r.error.includes('topsecret'));
});

test('pool.end() closes the underlying pool', async () => {
  const { db, log } = loadDbWithFakePg();
  await db.pool.end();
  assert.equal(log.endCalled, true);
});
