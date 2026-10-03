// Browser-direct (Cloudflare R2) upload flow: authorization, ownership, validation hand-off, cleanup and private
// document access. Runs the REAL routes' middleware + controllers against the in-memory world with a fake R2 driver.
const test = require('node:test');
const assert = require('node:assert/strict');

const { makeAgentWorld, loadAgentControllers, asUser } = require('./helpers/agentWorld');
const keys = require('../src/services/storage/keys');
const policy = require('../src/services/storage/policy');
const storage = require('../src/services/storage');
const { uploadError } = require('../src/utils/uploadSafety');

const A = 3; // agent 100 (owns properties 10, 11, 12, 13, 15, 16, 17)
const B = 4; // agent 200 (owns property 14)
const BUYER = 1;
const ADMIN = 5;

function fakeDriver() {
  const calls = { target: [], finalize: [], del: [], pending: [], read: [] };
  return {
    calls,
    failOnFinalize: 0,
    deleteThrows: false,
    async createUploadTarget(a) {
      calls.target.push(a);
      const finalKey = keys.buildFinalKey(a.kind, a.ownerId, a.contentType);
      return { pendingKey: keys.toPendingKey(finalKey), finalKey, uploadUrl: 'https://r2.test/put', headers: { 'Content-Type': a.contentType }, expiresInSeconds: 300, maxBytes: policy.getPolicy(a.kind).maxBytes };
    },
    async finalizeUpload(a) {
      calls.finalize.push(a);
      if (this.failOnFinalize && calls.finalize.length === this.failOnFinalize) throw uploadError(415, 'That file is not an accepted type.');
      const key = a.pendingKey.replace(/^pending\//, '');
      const isPrivate = policy.visibilityForPrefix(keys.parseFinalKey(key).prefix) === 'private';
      return { key, reference: isPrivate ? key : `https://media.example.com/${key}`, contentType: a.declaredContentType, size: 123 };
    },
    async deleteObject(k) { calls.del.push(k); if (this.deleteThrows) throw new Error('R2 down'); return true; },
    async deletePending(k) { calls.pending.push(k); return true; },
    async createPrivateReadUrl(k) { calls.read.push(k); return { url: 'https://r2.test/signed?X-Amz-Expires=120', expiresInSeconds: 120 }; },
  };
}

function setup({ r2 = true } = {}) {
  process.env.STORAGE_DRIVER = r2 ? 'r2' : 'local';
  const w = makeAgentWorld();
  const c = loadAgentControllers(w);
  const load = (rel) => { const f = require.resolve(rel); delete require.cache[f]; return require(f); };
  const d = load('../src/controllers/directUpload.controller');
  const mw = load('../src/middleware/directUpload');
  const driver = fakeDriver();
  storage.__setR2DriverForTests(driver);
  return { w, c, d, mw, driver };
}
test.afterEach(() => { storage.__setR2DriverForTests(null); delete process.env.STORAGE_DRIVER; });

/** Runs handlers like Express would: stops at the first one that responds; rejects on next(err). */
function run(handlers, { user, params = {}, body = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = { user, params, body, query: {}, headers: {} };
    const finishers = [];
    const res = {
      code: 200, headers: {},
      get statusCode() { return this.code; }, // Express exposes the status as statusCode
      status(c) { this.code = c; return this; },
      set(k, v) { this.headers[k] = v; return this; },
      on(ev, fn) { if (ev === 'finish') finishers.push(fn); return this; },
      json(b) { resolve({ status: this.code, body: b, req, res: this }); finishers.forEach((f) => f()); return this; },
      sendFile(p) { resolve({ status: this.code, body: { file: p }, req, res: this }); return this; },
    };
    let i = 0;
    const next = (err) => {
      if (err) return reject(err);
      const h = handlers[i]; i += 1;
      if (!h) return resolve({ status: 'done', body: null, req, res });
      try { const r = h(req, res, next); if (r && r.catch) r.catch(reject); } catch (e) { reject(e); }
      return undefined;
    };
    next();
  });
}
const tick = () => new Promise((r) => setImmediate(r));
const png = (size = 1000) => ({ contentType: 'image/png', size });
const as = (w, uid) => asUser(w, uid);

// ------------------------------------------------------------------ mode / gating
test('mode endpoint reports the active upload mode; direct endpoints are closed in local mode', async () => {
  let t = setup({ r2: false });
  assert.equal((await run([t.d.getUploadMode])).body.data.mode, 'multipart');
  const closed = await run([t.d.requireDirectMode]);
  assert.equal(closed.status, 409);
  assert.equal(closed.body.details.code, 'DIRECT_UPLOAD_DISABLED');
  t = setup({ r2: true });
  assert.equal((await run([t.d.getUploadMode])).body.data.mode, 'direct');
  assert.equal((await run([t.d.requireDirectMode])).status, 'done');
});

// ------------------------------------------------------------------ property images: presign
const propChain = (t, handler) => [t.d.requireDirectMode, t.c.property.requirePropertyModifier, handler];

test('presign property images: the owner gets targets for THAT property only', async () => {
  const t = setup();
  const r = await run(propChain(t, t.d.presignPropertyImages), { user: as(t.w, A), params: { id: '10' }, body: { files: [png(), png()] } });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.uploads.length, 2);
  assert.deepEqual(t.driver.calls.target.map((x) => [x.kind, x.ownerId]), [['property-image', 10], ['property-image', 10]]);
  assert.match(r.body.data.uploads[0].key, /^pending\/properties\/10\//);
});

test('presign property images: Agent B, a buyer and an anonymous-ish caller never get a URL for Agent A\'s listing', async () => {
  const t = setup();
  for (const uid of [B, BUYER]) {
    const r = await run(propChain(t, t.d.presignPropertyImages), { user: as(t.w, uid), params: { id: '10' }, body: { files: [png()] } });
    assert.equal(r.status, 403, `user ${uid}`);
  }
  assert.equal(t.driver.calls.target.length, 0);
  assert.equal((await run(propChain(t, t.d.presignPropertyImages), { user: as(t.w, A), params: { id: '999' }, body: { files: [png()] } })).status, 404);
  assert.equal(t.driver.calls.target.length, 0);
});

test('presign property images: same business rules as the multipart route (status, photo cap, type, size, count)', async () => {
  const t = setup();
  const go = (id, files, uid = A) => run(propChain(t, t.d.presignPropertyImages), { user: as(t.w, uid), params: { id: String(id) }, body: { files } });
  assert.equal((await go(15, [png()])).status, 409, 'sold listing is not editable by its agent');
  assert.equal((await go(10, [{ contentType: 'text/html', size: 100 }])).status, 400);
  assert.equal((await go(10, [{ contentType: 'application/pdf', size: 100 }])).status, 400, 'a PDF is not a photo');
  assert.equal((await go(10, [png(5 * 1024 * 1024 + 1)])).status, 400, 'over 5 MB');
  assert.equal((await go(10, [{ contentType: 'image/png', size: 0 }])).status, 400);
  assert.equal((await go(10, [{ contentType: 'image/png', size: 1.5 }])).status, 400);
  assert.equal((await go(10, Array.from({ length: 21 }, () => png()))).status, 400, 'more than 20 per request');
  assert.equal((await go(10, [])).status, 400);
  for (let i = 0; i < 29; i += 1) t.w.addImage(10);
  assert.equal((await go(10, [png(), png()])).status, 400, 'would exceed the per-listing cap');
  assert.equal(t.driver.calls.target.length, 0, 'no URL issued for any refused request');
});

// ------------------------------------------------------------------ property images: complete
const completeChain = (t) => [t.d.requireDirectMode, t.c.property.requirePropertyModifier, t.mw.finalizeDirectUploads('property-image', t.d.resolvePropertyOwner), t.c.property.addPropertyImages];
const pendingFor = (kind, owner, mime = 'image/png') => keys.toPendingKey(keys.buildFinalKey(kind, owner, mime));

test('complete: validated uploads are saved through the EXISTING controller, storing the public URL', async () => {
  const t = setup();
  const k1 = pendingFor('property-image', 10); const k2 = pendingFor('property-image', 10, 'image/jpeg');
  const r = await run(completeChain(t), { user: as(t.w, A), params: { id: '10' }, body: { uploads: [{ key: k1, contentType: 'image/png' }, { key: k2, contentType: 'image/jpeg' }] } });
  assert.equal(r.status, 201);
  assert.equal(t.driver.calls.finalize.length, 2);
  const stored = t.w.images.filter((i) => i.property_id === 10).map((i) => i.image_url);
  assert.deepEqual(stored.sort(), [`https://media.example.com/${k1.slice(8)}`, `https://media.example.com/${k2.slice(8)}`].sort());
  assert.equal(r.body.data.statusChanged, true, 'photos added to a LIVE listing send it back to review (unchanged rule)');
  assert.equal(t.w.properties[10].status, 'pending_review');
});

test('complete: keys issued for another property, another kind, or malformed/duplicate keys are rejected before any R2 call', async () => {
  const t = setup();
  const bad = [
    [{ key: pendingFor('property-image', 14), contentType: 'image/png' }],            // Agent B's property
    [{ key: pendingFor('verification-document', 100, 'application/pdf'), contentType: 'application/pdf' }], // wrong kind
    [{ key: keys.buildFinalKey('property-image', 10, 'image/png'), contentType: 'image/png' }],           // not a pending key
    [{ key: 'pending/properties/10/../14/x.png', contentType: 'image/png' }],
    [{ key: '../../etc/passwd', contentType: 'image/png' }],
    [{ key: 5, contentType: 'image/png' }],
    [{ key: pendingFor('property-image', 10) }],
  ];
  for (const uploads of bad) {
    await assert.rejects(run(completeChain(t), { user: as(t.w, A), params: { id: '10' }, body: { uploads } }), (e) => e.statusCode === 400);
  }
  const dup = pendingFor('property-image', 10);
  await assert.rejects(run(completeChain(t), { user: as(t.w, A), params: { id: '10' }, body: { uploads: [{ key: dup, contentType: 'image/png' }, { key: dup, contentType: 'image/png' }] } }), (e) => e.statusCode === 400);
  await assert.rejects(run(completeChain(t), { user: as(t.w, A), params: { id: '10' }, body: { uploads: [] } }), (e) => e.statusCode === 400);
  assert.equal(t.driver.calls.finalize.length, 0);
  assert.equal(t.w.images.filter((i) => i.property_id === 10).length, 0, 'no database rows created');
});

test('complete: Agent B and buyers cannot complete an upload on Agent A\'s property even with a "valid" key', async () => {
  const t = setup();
  const key = pendingFor('property-image', 10);
  for (const uid of [B, BUYER]) {
    const r = await run(completeChain(t), { user: as(t.w, uid), params: { id: '10' }, body: { uploads: [{ key, contentType: 'image/png' }] } });
    assert.equal(r.status, 403);
  }
  assert.equal(t.driver.calls.finalize.length, 0);
  assert.equal(t.w.images.length, 0);
});

test('complete: a storage failure leaves no database rows and cleans up what was already promoted', async () => {
  const t = setup();
  t.driver.failOnFinalize = 2;
  const k1 = pendingFor('property-image', 10); const k2 = pendingFor('property-image', 10);
  await assert.rejects(
    run(completeChain(t), { user: as(t.w, A), params: { id: '10' }, body: { uploads: [{ key: k1, contentType: 'image/png' }, { key: k2, contentType: 'image/png' }] } }),
    (e) => e.statusCode === 415
  );
  assert.equal(t.w.images.length, 0, 'DB untouched');
  assert.deepEqual(t.driver.calls.del, [k1.slice(8)], 'the first (already promoted) object is deleted again');
});

test('complete: if the controller then refuses (photo cap), the promoted objects are deleted', async () => {
  const t = setup();
  for (let i = 0; i < 29; i += 1) t.w.addImage(10);
  const k1 = pendingFor('property-image', 10); const k2 = pendingFor('property-image', 10);
  const r = await run(completeChain(t), { user: as(t.w, A), params: { id: '10' }, body: { uploads: [{ key: k1, contentType: 'image/png' }, { key: k2, contentType: 'image/png' }] } });
  assert.equal(r.status, 400);
  await tick();
  assert.deepEqual(t.driver.calls.del.sort(), [k1.slice(8), k2.slice(8)].sort());
  assert.equal(t.w.images.filter((i) => i.property_id === 10).length, 29, 'no new rows');
});

// ------------------------------------------------------------------ deleting images
test('delete image: only the owner can; the R2 object named by the row is deleted; an R2 failure never breaks the request', async () => {
  const t = setup();
  const key = keys.buildFinalKey('property-image', 10, 'image/png');
  const img = t.w.addImage(10, { image_url: `https://media.example.com/${key}`, is_primary: true });
  const del = (uid) => run([t.c.property.requirePropertyModifier, t.c.property.deletePropertyImage], { user: as(t.w, uid), params: { id: '10', imageId: String(img.image_id) } });

  assert.equal((await del(B)).status, 403, 'Agent B cannot delete Agent A\'s image');
  assert.equal((await del(BUYER)).status, 403);
  assert.equal(t.driver.calls.del.length, 0);
  assert.equal(t.w.images.length, 1);

  t.driver.deleteThrows = true; // R2 outage
  const r = await del(A);
  assert.equal(r.status, 200, 'still succeeds');
  assert.equal(t.w.images.length, 0, 'row removed');
  assert.deepEqual(t.driver.calls.del, [key]);

  const key2 = keys.buildFinalKey('property-image', 10, 'image/jpeg');
  const img2 = t.w.addImage(10, { image_url: `https://media.example.com/${key2}` });
  t.driver.deleteThrows = false;
  await run([t.c.property.requirePropertyModifier, t.c.property.deletePropertyImage], { user: as(t.w, A), params: { id: '10', imageId: String(img2.image_id) } });
  assert.equal(t.driver.calls.del[t.driver.calls.del.length - 1], key2, 'targets exactly this object');
});

// ------------------------------------------------------------------ verification documents
test('presign verification document: the owner is the caller\'s OWN agent (never an id from the body); buyers and verified agents refused', async () => {
  const t = setup();
  const go = (uid, body) => run([t.d.requireDirectMode, t.d.presignVerificationDocument], { user: as(t.w, uid), body });
  const pdf = { contentType: 'application/pdf', size: 5000 };
  const r = await go(A, { documentType: 'license', agentId: 200, ownerId: 200, files: [pdf] });
  assert.equal(r.status, 200);
  assert.equal(t.driver.calls.target[0].ownerId, 100);
  assert.equal(t.driver.calls.target[0].kind, 'verification-document');
  assert.equal((await go(BUYER, { documentType: 'license', files: [pdf] })).status, 404, 'a buyer has no agent profile');
  assert.equal((await go(A, { documentType: 'nonsense', files: [pdf] })).status, 400);
  assert.equal((await go(A, { documentType: 'license', files: [{ contentType: 'image/gif', size: 10 }] })).status, 400, 'gif is not an accepted document');
  assert.equal((await go(A, { documentType: 'license', files: [{ contentType: 'application/pdf', size: 10 * 1024 * 1024 + 1 }] })).status, 400);
  assert.equal((await go(A, { documentType: 'license', files: [pdf, pdf] })).status, 400, 'one document per request');
  t.w.agents[100].verification_status = 'verified';
  assert.equal((await go(A, { documentType: 'license', files: [pdf] })).status, 409);
});

test('complete verification document: stores the bare PRIVATE key (not a URL); keys of another agent are rejected', async () => {
  const t = setup();
  const chain = [t.d.requireDirectMode, t.mw.finalizeDirectUploads('verification-document', t.d.resolveAgentOwner), t.c.verification.uploadMyDocument];
  const mine = pendingFor('verification-document', 100, 'application/pdf');
  const r = await run(chain, { user: as(t.w, A), body: { documentType: 'license', uploads: [{ key: mine, contentType: 'application/pdf' }] } });
  assert.equal(r.status, 201);
  const row = t.w.docs[t.w.docs.length - 1];
  assert.equal(row.file_url, mine.slice(8));
  assert.ok(!/^https?:/i.test(row.file_url), 'private documents never get a stored URL');

  const theirs = pendingFor('verification-document', 200, 'application/pdf');
  await assert.rejects(run(chain, { user: as(t.w, A), body: { documentType: 'license', uploads: [{ key: theirs, contentType: 'application/pdf' }] } }), (e) => e.statusCode === 400);
  const noAgent = await run(chain, { user: as(t.w, BUYER), body: { documentType: 'license', uploads: [{ key: mine, contentType: 'application/pdf' }] } });
  assert.equal(noAgent.status, 404);
});

test('renewal documents: own renewal only, editable status only, and the key must belong to the caller\'s agent', async () => {
  const t = setup();
  const mine = t.w.addRenewal({ agent_id: 100, status: 'draft' });
  const theirs = t.w.addRenewal({ agent_id: 200, status: 'draft' });
  const locked = t.w.addRenewal({ agent_id: 100, status: 'submitted' });
  const pdf = { contentType: 'application/pdf', size: 1000 };
  const presign = (uid, rid) => run([t.d.requireDirectMode, t.d.presignRenewalDocument], { user: as(t.w, uid), params: { id: String(rid) }, body: { documentType: 'license', files: [pdf] } });
  assert.equal((await presign(A, mine.renewal_id)).status, 200);
  assert.equal(t.driver.calls.target[0].kind, 'renewal-document');
  assert.equal((await presign(A, theirs.renewal_id)).status, 404, 'cannot presign for another agent\'s renewal');
  assert.equal((await presign(A, locked.renewal_id)).status, 409);
  assert.equal((await presign(BUYER, mine.renewal_id)).status, 404);

  const chain = [t.d.requireDirectMode, t.mw.finalizeDirectUploads('renewal-document', t.d.resolveAgentOwner), t.c.renewal.uploadRenewalDocument];
  const key = pendingFor('renewal-document', 100, 'application/pdf');
  const r = await run(chain, { user: as(t.w, A), params: { id: String(mine.renewal_id) }, body: { documentType: 'license', uploads: [{ key, contentType: 'application/pdf' }] } });
  assert.equal(r.status, 201);
  assert.equal(t.w.docs[t.w.docs.length - 1].file_url, key.slice(8));
});

// ------------------------------------------------------------------ private document access
test('private document access: owner and admins get a short-lived signed URL; a stranger gets 404 and no URL is ever generated', async () => {
  const t = setup();
  const key = keys.buildFinalKey('verification-document', 100, 'application/pdf');
  const doc = t.w.addDoc({ agent_id: 100, file_url: key });
  const get = (uid) => run([t.c.verification.getDocumentFile], { user: as(t.w, uid), params: { documentId: String(doc.document_id) } });

  const owner = await get(A);
  assert.equal(owner.status, 200);
  assert.match(owner.body.data.url, /X-Amz-Expires=120/);
  assert.equal(owner.body.data.expiresInSeconds, 120);
  assert.equal(owner.res.headers['Cache-Control'], 'no-store');
  assert.equal((await get(ADMIN)).status, 200);

  const before = t.driver.calls.read.length;
  assert.equal((await get(B)).status, 404, 'another agent');
  assert.equal(t.driver.calls.read.length, before, 'no signed URL created for a non-owner');
  const buyer = await get(BUYER).catch((e) => e);
  assert.ok(buyer.status === 404 || buyer.status === 403 || buyer instanceof Error, 'a buyer is refused');
  assert.equal(t.driver.calls.read.length, before);
  assert.equal(doc.file_url, key, 'the database still holds only the stable key, never a signed URL');
});

test('private document access: legacy local documents are still served from disk after the switch to R2', async () => {
  const t = setup();
  const doc = t.w.addDoc({ agent_id: 100, file_url: '/uploads/documents/legacy.pdf' });
  const r = await run([t.c.verification.getDocumentFile], { user: as(t.w, A), params: { documentId: String(doc.document_id) } });
  assert.ok(r.body.file && r.body.file.endsWith('legacy.pdf'));
  assert.equal(t.driver.calls.read.length, 0);
});

test('local mode is unchanged: references stay /uploads/... and local files are deleted', async () => {
  const t = setup({ r2: false });
  const { url, abs } = t.w.realFile('properties', 'direct-upload-test.png');
  const img = t.w.addImage(10, { image_url: url });
  const r = await run([t.c.property.requirePropertyModifier, t.c.property.deletePropertyImage], { user: as(t.w, A), params: { id: '10', imageId: String(img.image_id) } });
  assert.equal(r.status, 200);
  assert.equal(require('node:fs').existsSync(abs), false, 'the real local file was removed');
  assert.equal(t.driver.calls.del.length, 0, 'R2 untouched in local mode');
  t.w.cleanup();
});
