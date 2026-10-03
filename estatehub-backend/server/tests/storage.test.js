// Storage layer: object keys, R2 driver (against an in-memory fake), storage facade, and the shared rate-limit store.
// Needs no Cloudflare credentials, AWS SDK, MySQL or network.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const keys = require('../src/services/storage/keys');
const policy = require('../src/services/storage/policy');
const { createR2Driver } = require('../src/services/storage/r2Driver');
const storage = require('../src/services/storage');
const { UPLOAD_ROOT } = require('../src/config/paths');
const { UpstashRateLimitStore } = require('../src/middleware/upstashRateLimitStore');
const { makeFakeR2, PNG, JPEG, PDF, HTML } = require('./helpers/fakeR2');

const CONFIG = { publicBucket: 'pub-bucket', privateBucket: 'priv-bucket', publicBaseUrl: 'https://media.example.com/' };
function driverWithFake() {
  const fake = makeFakeR2();
  const driver = createR2Driver({ client: fake.client, signUrl: fake.signUrl, commands: fake.commands, config: CONFIG });
  return { fake, driver };
}
const rejects = (promise, status) => assert.rejects(promise, (err) => err.statusCode === status);

function withEnv(vars, fn) {
  const saved = {};
  Object.keys(vars).forEach((k) => { saved[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; });
  const restore = () => Object.keys(saved).forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; });
  let out;
  try { out = fn(); } catch (e) { restore(); throw e; }
  return out && typeof out.then === 'function' ? out.finally(restore) : (restore(), out);
}

// ---------------------------------------------------------------- keys
test('keys: built keys are prefix/ownerId/uuid.ext with the extension from the validated MIME type', () => {
  const key = keys.buildFinalKey('property-image', 12, 'image/png');
  assert.match(key, /^properties\/12\/[0-9a-f-]{36}\.png$/);
  assert.match(keys.buildFinalKey('verification-document', 7, 'application/pdf'), /^verification\/7\/[0-9a-f-]{36}\.pdf$/);
  assert.match(keys.buildFinalKey('renewal-document', 7, 'image/jpeg'), /^renewals\/7\/[0-9a-f-]{36}\.jpg$/);
  assert.match(keys.buildFinalKey('avatar', 3, 'image/webp'), /^avatars\/3\/[0-9a-f-]{36}\.webp$/);
  assert.notEqual(keys.buildFinalKey('property-image', 1, 'image/png'), keys.buildFinalKey('property-image', 1, 'image/png'), 'collision-resistant');
});

test('keys: owner ids and MIME types that could build a traversal/odd key are refused', () => {
  for (const bad of ['../1', '1/../2', '', '0', -3, 1.5, NaN, '12/../../x', null, undefined]) {
    assert.throws(() => keys.buildFinalKey('property-image', bad, 'image/png'), undefined, `owner ${String(bad)}`);
  }
  assert.throws(() => keys.buildFinalKey('property-image', 1, 'text/html'));
  assert.throws(() => keys.buildFinalKey('property-image', 1, 'application/pdf'), undefined, 'a PDF is not a property image');
  assert.throws(() => keys.buildFinalKey('nope', 1, 'image/png'));
});

test('keys: only strictly well-formed keys parse (no ../, absolute paths, backslashes, extra segments, wrong prefix)', () => {
  const good = keys.buildFinalKey('property-image', 5, 'image/png');
  assert.ok(keys.parseFinalKey(good));
  assert.equal(keys.parseFinalKey(good).ownerId, 5);
  const uuid = good.split('/')[2];
  for (const bad of [
    `/properties/5/${uuid}`, `properties/5/../6/${uuid}`, `properties//5/${uuid}`, `properties/5/${uuid}/x.png`,
    'properties/5/evil.png', `properties/5/${uuid.replace('.png', '.html')}`, `secrets/5/${uuid}`, `properties\\5\\${uuid}`,
    `properties/05/${uuid}`, 'pending/properties/5/x', '', null, 42,
  ]) {
    assert.equal(keys.parseFinalKey(bad), null, String(bad));
  }
  assert.equal(keys.parsePendingKey(good), null, 'a final key is not a pending key');
  const pending = keys.toPendingKey(good);
  assert.equal(pending, `pending/${good}`);
  assert.equal(keys.parsePendingKey(pending).finalKey, good);
  assert.equal(keys.parsePendingKey('pending/../etc/passwd'), null);
  assert.throws(() => keys.toPendingKey('../x'));
});

test('keys: keyFromReference accepts bare keys and public URLs on any host, rejects everything else', () => {
  const key = keys.buildFinalKey('property-image', 9, 'image/jpeg');
  assert.equal(keys.keyFromReference(key), key);
  assert.equal(keys.keyFromReference(`https://media.example.com/${key}`), key);
  assert.equal(keys.keyFromReference(`https://other.host/base/${key}`), key, 'host-agnostic, optional base path');
  assert.equal(keys.keyFromReference(`https://media.example.com/${key}?x=1#y`), key);
  assert.equal(keys.keyFromReference('/uploads/properties/abc123.png'), null, 'legacy local file');
  assert.equal(keys.keyFromReference('https://media.example.com/properties/9/not-a-uuid.png'), null);
  assert.equal(keys.keyFromReference('https://media.example.com/../../etc/passwd'), null);
  assert.equal(keys.keyFromReference('javascript:alert(1)'), null);
  assert.equal(keys.keyFromReference(null), null);
});

test('policy: listing photos are public; verification and renewal documents are private', () => {
  assert.equal(policy.getPolicy('property-image').visibility, 'public');
  assert.equal(policy.getPolicy('avatar').visibility, 'public');
  assert.equal(policy.getPolicy('verification-document').visibility, 'private');
  assert.equal(policy.getPolicy('renewal-document').visibility, 'private');
  assert.equal(policy.visibilityForPrefix('verification'), 'private');
  assert.equal(policy.visibilityForPrefix('unknown'), null);
});

// ---------------------------------------------------------------- r2 driver
test('r2: presign targets a PENDING key in the right bucket with the content type bound in', async () => {
  const { fake, driver } = driverWithFake();
  const img = await driver.createUploadTarget({ kind: 'property-image', ownerId: 10, contentType: 'image/png' });
  assert.match(img.pendingKey, /^pending\/properties\/10\//);
  assert.equal(img.finalKey, img.pendingKey.replace('pending/', ''));
  assert.deepEqual(img.headers, { 'Content-Type': 'image/png' });
  assert.match(img.uploadUrl, /pub-bucket\/pending\/properties\/10\//);
  assert.equal(img.expiresInSeconds, 300);
  const doc = await driver.createUploadTarget({ kind: 'verification-document', ownerId: 100, contentType: 'application/pdf' });
  assert.match(doc.uploadUrl, /priv-bucket\/pending\/verification\/100\//, 'documents go to the PRIVATE bucket');
  assert.equal(fake.calls.length, 0, 'presigning performs no bucket operation');
  await rejects(driver.createUploadTarget({ kind: 'property-image', ownerId: 1, contentType: 'text/html' }), 415);
  await rejects(driver.createUploadTarget({ kind: 'property-image', ownerId: 1, contentType: 'application/pdf' }), 415);
});

test('r2: finalize validates the bytes, promotes pending -> final, removes pending, and returns a public URL for photos', async () => {
  const { fake, driver } = driverWithFake();
  const t = await driver.createUploadTarget({ kind: 'property-image', ownerId: 10, contentType: 'image/png' });
  fake.store.set(`pub-bucket/${t.pendingKey}`, { body: PNG, contentType: 'image/png' });
  const out = await driver.finalizeUpload({ kind: 'property-image', pendingKey: t.pendingKey, declaredContentType: 'image/png' });
  assert.equal(out.key, t.finalKey);
  assert.equal(out.reference, `https://media.example.com/${t.finalKey}`);
  assert.equal(out.contentType, 'image/png');
  assert.ok(fake.has('pub-bucket', t.finalKey));
  assert.ok(!fake.has('pub-bucket', t.pendingKey), 'pending object removed');
});

test('r2: PRIVATE documents are stored as a bare key — never a URL', async () => {
  const { fake, driver } = driverWithFake();
  const t = await driver.createUploadTarget({ kind: 'verification-document', ownerId: 100, contentType: 'application/pdf' });
  fake.store.set(`priv-bucket/${t.pendingKey}`, { body: PDF, contentType: 'application/pdf' });
  const out = await driver.finalizeUpload({ kind: 'verification-document', pendingKey: t.pendingKey, declaredContentType: 'application/pdf' });
  assert.equal(out.reference, t.finalKey);
  assert.ok(!/^https?:/i.test(out.reference));
  assert.ok(fake.has('priv-bucket', t.finalKey));
  assert.ok(!fake.has('pub-bucket', t.finalKey), 'never lands in the public bucket');
});

test('r2: finalize rejects spoofed content (HTML declared as an image) and deletes it', async () => {
  const { fake, driver } = driverWithFake();
  const t = await driver.createUploadTarget({ kind: 'property-image', ownerId: 10, contentType: 'image/png' });
  fake.store.set(`pub-bucket/${t.pendingKey}`, { body: HTML, contentType: 'image/png' });
  await rejects(driver.finalizeUpload({ kind: 'property-image', pendingKey: t.pendingKey, declaredContentType: 'image/png' }), 415);
  assert.ok(!fake.has('pub-bucket', t.pendingKey), 'rejected upload is deleted');
  assert.ok(!fake.has('pub-bucket', t.finalKey), 'and never promoted');
});

test('r2: finalize rejects a type mismatch (JPEG bytes declared as PNG), oversize, empty and missing uploads', async () => {
  const { fake, driver } = driverWithFake();
  const mk = async (body, declared = 'image/png') => {
    const t = await driver.createUploadTarget({ kind: 'property-image', ownerId: 10, contentType: declared });
    if (body) fake.store.set(`pub-bucket/${t.pendingKey}`, { body, contentType: declared });
    return t;
  };
  let t = await mk(JPEG);
  await rejects(driver.finalizeUpload({ kind: 'property-image', pendingKey: t.pendingKey, declaredContentType: 'image/png' }), 415);
  assert.ok(!fake.has('pub-bucket', t.pendingKey));

  t = await mk(Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]));
  await rejects(driver.finalizeUpload({ kind: 'property-image', pendingKey: t.pendingKey, declaredContentType: 'image/png' }), 413);
  assert.ok(!fake.has('pub-bucket', t.pendingKey));

  t = await mk(Buffer.alloc(0));
  fake.store.set(`pub-bucket/${t.pendingKey}`, { body: Buffer.alloc(0), contentType: 'image/png' });
  await rejects(driver.finalizeUpload({ kind: 'property-image', pendingKey: t.pendingKey, declaredContentType: 'image/png' }), 400);

  t = await mk(null);
  await rejects(driver.finalizeUpload({ kind: 'property-image', pendingKey: t.pendingKey, declaredContentType: 'image/png' }), 400);
});

test('r2: a PDF cannot be finalized as a property image (policy is per kind)', async () => {
  const { fake, driver } = driverWithFake();
  const t = await driver.createUploadTarget({ kind: 'property-image', ownerId: 10, contentType: 'image/png' });
  fake.store.set(`pub-bucket/${t.pendingKey}`, { body: PDF, contentType: 'image/png' });
  await rejects(driver.finalizeUpload({ kind: 'property-image', pendingKey: t.pendingKey, declaredContentType: 'image/png' }), 415);
});

test('r2: delete targets exactly the named object in the right bucket, and refuses anything that is not a valid key', async () => {
  const { fake, driver } = driverWithFake();
  const pubKey = keys.buildFinalKey('property-image', 10, 'image/png');
  const privKey = keys.buildFinalKey('verification-document', 100, 'application/pdf');
  const other = keys.buildFinalKey('property-image', 11, 'image/png');
  fake.store.set(`pub-bucket/${pubKey}`, { body: PNG });
  fake.store.set(`pub-bucket/${other}`, { body: PNG });
  fake.store.set(`priv-bucket/${privKey}`, { body: PDF });
  assert.equal(await driver.deleteObject(pubKey), true);
  assert.ok(!fake.has('pub-bucket', pubKey));
  assert.ok(fake.has('pub-bucket', other), 'a neighbouring object is untouched');
  assert.equal(await driver.deleteObject(privKey), true);
  assert.ok(!fake.has('priv-bucket', privKey));
  const before = fake.calls.length;
  for (const bad of ['../x', 'properties/10', '/etc/passwd', 'pending/x', '']) assert.equal(await driver.deleteObject(bad), false);
  assert.equal(fake.calls.length, before, 'no bucket call is made for an invalid key');
});

test('r2: private read URLs are short-lived, only for private keys, and carry no permanent public URL', async () => {
  const { driver } = driverWithFake();
  const priv = keys.buildFinalKey('verification-document', 100, 'application/pdf');
  const link = await driver.createPrivateReadUrl(priv);
  assert.ok(link.expiresInSeconds <= 300);
  assert.match(link.url, /priv-bucket\/.+X-Amz-Expires=120/);
  assert.ok(!link.url.startsWith('https://media.example.com'), 'not the public base URL');
  assert.equal(await driver.createPrivateReadUrl(keys.buildFinalKey('property-image', 1, 'image/png')), null, 'public keys never get signed private links');
  assert.equal(await driver.createPrivateReadUrl('../etc/passwd'), null);
});

// ---------------------------------------------------------------- facade
test('storage facade: defaults to the local multipart driver; STORAGE_DRIVER=r2 switches to direct uploads', () => {
  withEnv({ STORAGE_DRIVER: undefined }, () => assert.equal(storage.getUploadMode(), 'multipart'));
  withEnv({ STORAGE_DRIVER: 'local' }, () => assert.equal(storage.getUploadMode(), 'multipart'));
  withEnv({ STORAGE_DRIVER: 'r2' }, () => assert.equal(storage.getUploadMode(), 'direct'));
});

test('storage facade: local driver still deletes its own files and can never delete outside the upload root', async () => {
  await withEnv({ STORAGE_DRIVER: 'local' }, async () => {
    const dir = path.join(UPLOAD_ROOT, 'properties');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'storage-test-file.png');
    fs.writeFileSync(file, 'x');
    assert.equal(await storage.deleteByReference('/uploads/properties/storage-test-file.png'), true);
    assert.ok(!fs.existsSync(file));
    const outside = path.join(UPLOAD_ROOT, '..', 'storage-test-outside.txt');
    fs.writeFileSync(outside, 'keep');
    assert.equal(await storage.deleteByReference('/uploads/properties/../../storage-test-outside.txt'), false);
    assert.ok(fs.existsSync(outside), 'file outside the root is untouched');
    fs.unlinkSync(outside);
    assert.equal(await storage.deleteByReference(null), false);
  });
});

test('storage facade (r2): deleteByReference resolves URLs and bare keys, keeps working after a switch from local, and never throws', async () => {
  const { driver, fake } = driverWithFake();
  storage.__setR2DriverForTests(driver);
  try {
    await withEnv({ STORAGE_DRIVER: 'r2' }, async () => {
      const key = keys.buildFinalKey('property-image', 10, 'image/png');
      fake.store.set(`pub-bucket/${key}`, { body: PNG });
      assert.equal(await storage.deleteByReference(`https://media.example.com/${key}`), true);
      assert.ok(!fake.has('pub-bucket', key));
      const docKey = keys.buildFinalKey('renewal-document', 100, 'application/pdf');
      fake.store.set(`priv-bucket/${docKey}`, { body: PDF });
      assert.equal(await storage.deleteByReference(docKey), true);
      assert.ok(!fake.has('priv-bucket', docKey));
      // a legacy local reference is still handled by the local driver, not sent to R2
      const before = fake.calls.length;
      await storage.deleteByReference('/uploads/documents/does-not-exist.pdf');
      assert.equal(fake.calls.length, before);
    });
    // a failing R2 never propagates
    storage.__setR2DriverForTests({ deleteObject: async () => { throw new Error('R2 down'); } });
    await withEnv({ STORAGE_DRIVER: 'r2' }, async () => {
      assert.equal(await storage.deleteByReference(keys.buildFinalKey('property-image', 1, 'image/png')), false);
    });
  } finally {
    storage.__setR2DriverForTests(null);
  }
});

test('storage facade: getPrivateFileAccess — local file path, or a short-lived signed URL; never a stored/public URL', async () => {
  const { driver } = driverWithFake();
  storage.__setR2DriverForTests(driver);
  try {
    await withEnv({ STORAGE_DRIVER: 'r2' }, async () => {
      const key = keys.buildFinalKey('verification-document', 100, 'application/pdf');
      const access = await storage.getPrivateFileAccess(key);
      assert.equal(access.type, 'signed-url');
      assert.match(access.url, /X-Amz-Expires=/);
      assert.equal(await storage.getPrivateFileAccess(keys.buildFinalKey('property-image', 1, 'image/png')), null);
      const local = await storage.getPrivateFileAccess('/uploads/documents/abc.pdf');
      assert.equal(local.type, 'file');
      assert.ok(local.path.startsWith(path.resolve(UPLOAD_ROOT)));
      assert.equal(await storage.getPrivateFileAccess('/uploads/documents/../../etc/passwd'), null);
    });
    // an R2 key but this process is in local mode: no access (cannot reach R2)
    await withEnv({ STORAGE_DRIVER: 'local' }, async () => {
      assert.equal(await storage.getPrivateFileAccess(keys.buildFinalKey('verification-document', 100, 'application/pdf')), null);
    });
  } finally {
    storage.__setR2DriverForTests(null);
  }
});

test('storage config: R2 mode needs all variables, https base URL, and two DIFFERENT buckets; readiness leaks no values', async () => {
  const full = {
    STORAGE_DRIVER: 'r2', R2_ACCOUNT_ID: 'acct', R2_ACCESS_KEY_ID: 'AKIDEXAMPLE', R2_SECRET_ACCESS_KEY: 'super-secret-value',
    R2_PUBLIC_BUCKET_NAME: 'pub', R2_PRIVATE_BUCKET_NAME: 'priv', R2_PUBLIC_BASE_URL: 'https://media.example.com',
  };
  assert.deepEqual(storage.validateStorageEnv(full), []);
  assert.deepEqual(storage.validateStorageEnv({ STORAGE_DRIVER: 'local' }), []);
  assert.ok(storage.validateStorageEnv({ ...full, R2_ACCESS_KEY_ID: '' }).some((p) => p.includes('R2_ACCESS_KEY_ID')));
  assert.ok(storage.validateStorageEnv({ ...full, R2_PUBLIC_BASE_URL: 'http://media.example.com' }).some((p) => p.includes('https')));
  assert.ok(storage.validateStorageEnv({ ...full, R2_PRIVATE_BUCKET_NAME: 'pub' }).some((p) => p.includes('different')));
  await withEnv({ ...full, R2_SECRET_ACCESS_KEY: undefined }, async () => {
    const r = await storage.checkReadiness();
    assert.equal(r.configured, false);
    assert.deepEqual(r.missing, ['R2_SECRET_ACCESS_KEY']);
  });
  await withEnv(full, async () => {
    const json = JSON.stringify(await storage.checkReadiness());
    for (const secret of ['AKIDEXAMPLE', 'super-secret-value', 'acct', 'pub', 'priv']) {
      if (secret.length > 4) assert.ok(!json.includes(secret), `readiness must not contain ${secret}`);
    }
  });
});

// ---------------------------------------------------------------- shared rate-limit store
function fakeUpstash(handler) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return handler(calls[calls.length - 1], calls.length);
  };
  return { fetchImpl, calls };
}
const ok = (results) => ({ ok: true, status: 200, json: async () => results.map((result) => ({ result })) });

test('rate-limit store: INCR + PEXPIRE NX + PTTL with auth and a namespaced key', async () => {
  const { fetchImpl, calls } = fakeUpstash(() => ok([3, 1, 54000]));
  const store = new UpstashRateLimitStore({ url: 'https://u.example/', token: 'tok', prefix: 'p:', fetchImpl });
  store.init({ windowMs: 900000 });
  const before = Date.now();
  const r = await store.increment('1.2.3.4');
  assert.equal(r.totalHits, 3);
  assert.ok(r.resetTime.getTime() >= before + 53000 && r.resetTime.getTime() <= Date.now() + 54000);
  assert.equal(calls[0].url, 'https://u.example/pipeline');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok');
  assert.deepEqual(calls[0].body, [['INCR', 'p:1.2.3.4'], ['PEXPIRE', 'p:1.2.3.4', '900000', 'NX'], ['PTTL', 'p:1.2.3.4']]);
  await store.decrement('k');
  await store.resetKey('k');
  assert.deepEqual(calls[1].body, [['DECR', 'p:k']]);
  assert.deepEqual(calls[2].body, [['DEL', 'p:k']]);
});

test('rate-limit store: fails OPEN by default when Redis is down, and CLOSED when configured', async () => {
  const down = () => { throw new Error('network down'); };
  const open = new UpstashRateLimitStore({ url: 'https://u', token: 't', fetchImpl: async () => down() });
  const warn = console.warn; console.warn = () => {};
  try {
    const r = await open.increment('k');
    assert.equal(r.totalHits, 1, 'allowed');
    const closed = new UpstashRateLimitStore({ url: 'https://u', token: 't', failClosed: true, fetchImpl: async () => down() });
    await assert.rejects(closed.increment('k'));
    const http500 = new UpstashRateLimitStore({ url: 'https://u', token: 't', fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }) });
    assert.equal((await http500.increment('k')).totalHits, 1);
  } finally { console.warn = warn; }
  assert.throws(() => new UpstashRateLimitStore({ url: '', token: '' }));
});
