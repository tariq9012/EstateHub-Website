// Upload hardening: magic-byte detection, safe names, path safety, guards, error mapping. No multer needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const safety = require('../src/utils/uploadSafety');
const guards = require('../src/middleware/uploadGuards');
const { statusAndMessage } = require('../src/middleware/errorHandler');

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
const GIF = Buffer.from('GIF89a\x01\x00\x01\x00', 'latin1');
const WEBP = Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBPVP8 ', 'latin1')]);
const PDF = Buffer.from('%PDF-1.7\n%....', 'latin1');
const HTML = Buffer.from('<html><script>alert(1)</script></html>');
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(30)]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');

function tmpdir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'eh-upload-')); }
function writeFile(dir, name, buf) { const p = path.join(dir, name); fs.writeFileSync(p, buf); return p; }
function fakeFile(p, mimetype) { return { path: p, mimetype, size: fs.statSync(p).size }; }
function runGuard(mw, req) { return new Promise((resolve) => mw(req, {}, (err) => resolve(err))); }

test('detectMimeFromBuffer recognises real files and rejects everything else', () => {
  assert.equal(safety.detectMimeFromBuffer(JPEG), 'image/jpeg');
  assert.equal(safety.detectMimeFromBuffer(PNG), 'image/png');
  assert.equal(safety.detectMimeFromBuffer(GIF), 'image/gif');
  assert.equal(safety.detectMimeFromBuffer(WEBP), 'image/webp');
  assert.equal(safety.detectMimeFromBuffer(PDF), 'application/pdf');
  for (const [name, buf] of [['html', HTML], ['exe', EXE], ['svg', SVG], ['empty', Buffer.alloc(0)], ['short', Buffer.from([0xff, 0xd8])]]) {
    assert.equal(safety.detectMimeFromBuffer(buf), null, name);
  }
  assert.equal(safety.detectMimeFromBuffer(null), null);
});

test('safeFilename: random 128-bit hex + extension from the validated TYPE (never the client filename)', () => {
  const names = new Set();
  for (let i = 0; i < 200; i += 1) names.add(safety.safeFilename('application/pdf'));
  assert.equal(names.size, 200, 'no collisions');
  for (const n of names) assert.match(n, /^[0-9a-f]{32}\.pdf$/);
  assert.match(safety.safeFilename('image/jpeg'), /^[0-9a-f]{32}\.jpg$/);
  assert.throws(() => safety.safeFilename('text/html'), (e) => e.statusCode === 415);
  assert.throws(() => safety.safeFilename('image/svg+xml'), (e) => e.statusCode === 415);
  // the multer callback ignores originalname entirely
  return new Promise((resolve, reject) => {
    safety.randomFilenameCallback({}, { originalname: '../../evil.html', mimetype: 'image/png' }, (err, name) => {
      try { assert.ifError(err); assert.match(name, /^[0-9a-f]{32}\.png$/); resolve(); } catch (e) { reject(e); }
    });
  });
});

test('fileFilter accepts only the allowed declared types (415 otherwise)', () => {
  const docs = safety.makeFileFilter(safety.DOCUMENT_MIMES, 'docs only');
  const ok = []; docs({}, { mimetype: 'application/pdf' }, (e, accepted) => ok.push([e, accepted]));
  assert.deepEqual(ok[0], [null, true]);
  for (const bad of ['text/html', 'application/x-msdownload', 'image/svg+xml', 'application/javascript', 'image/gif']) {
    let got; docs({}, { mimetype: bad }, (e) => { got = e; });
    assert.equal(got.statusCode, 415, bad);
  }
  let img; safety.makeFileFilter(safety.IMAGE_MIMES, 'x')({}, { mimetype: 'application/pdf' }, (e) => { img = e; });
  assert.equal(img.statusCode, 415, 'a PDF is not an image');
});

test('resolveStoredFile only ever resolves inside the upload root', () => {
  const root = tmpdir();
  assert.equal(safety.resolveStoredFile(root, '/uploads/documents/abc123.pdf'), path.join(root, 'documents', 'abc123.pdf'));
  for (const bad of [
    '/uploads/documents/../../etc/passwd', '/uploads/documents/..', '/uploads/../secret.pdf', '/uploads/documents/a/b.pdf',
    '/uploads/other/x.pdf', 'uploads/documents/x.pdf', 'http://evil.example/uploads/documents/x.pdf', '/etc/passwd',
    '/uploads/documents/x.pdf/../../y', '/uploads/documents/%2e%2e%2fx.pdf', '', null, undefined, 42,
  ]) assert.equal(safety.resolveStoredFile(root, bad), null, String(bad));
});

test('deleteStoredFile removes our own file and can never delete outside the root', async () => {
  const root = tmpdir(); fs.mkdirSync(path.join(root, 'documents'));
  const inside = writeFile(path.join(root, 'documents'), 'a1.pdf', PDF);
  const outsideDir = tmpdir(); const outside = writeFile(outsideDir, 'precious.txt', Buffer.from('keep me'));
  assert.equal(await safety.deleteStoredFile(root, '/uploads/documents/a1.pdf'), true);
  assert.equal(fs.existsSync(inside), false);
  assert.equal(await safety.deleteStoredFile(root, '/uploads/documents/a1.pdf'), false, 'already gone -> false, no throw');
  const rel = path.relative(path.join(root, 'documents'), outside);
  assert.equal(await safety.deleteStoredFile(root, `/uploads/documents/${rel}`), false);
  assert.equal(fs.existsSync(outside), true, 'the file outside the upload root is untouched');
});

test('validateUploadedFiles: accepts genuine files, rejects spoofed content and deletes it', async () => {
  const dir = tmpdir(); const docs = guards.validateUploadedFiles(safety.DOCUMENT_MIMES);
  const good = writeFile(dir, 'good.pdf', PDF);
  assert.equal(await runGuard(docs, { file: fakeFile(good, 'application/pdf') }), undefined);
  assert.equal(fs.existsSync(good), true);

  const cases = [
    ['HTML disguised as PNG', HTML, 'image/png', 415],
    ['EXE disguised as PDF', EXE, 'application/pdf', 415],
    ['SVG (script-capable) disguised as PNG', SVG, 'image/png', 415],
    ['real PNG but declared as PDF', PNG, 'application/pdf', 415],
    ['GIF is not an allowed document type', GIF, 'image/gif', 415],
  ];
  for (const [label, buf, mime, status] of cases) {
    const p = writeFile(dir, `spoof-${status}-${label.length}.bin`, buf);
    const err = await runGuard(docs, { file: fakeFile(p, mime) });
    assert.equal(err && err.statusCode, status, label);
    assert.equal(fs.existsSync(p), false, `${label}: file deleted`);
  }
  const empty = writeFile(dir, 'empty.pdf', Buffer.alloc(0));
  assert.equal((await runGuard(docs, { file: fakeFile(empty, 'application/pdf') })).statusCode, 400);
  assert.equal(fs.existsSync(empty), false);
});

test('validateUploadedFiles with several files: one bad file removes ALL of them', async () => {
  const dir = tmpdir(); const images = guards.validateUploadedFiles(safety.IMAGE_MIMES);
  const a = writeFile(dir, 'a.png', PNG); const b = writeFile(dir, 'b.png', HTML); const c = writeFile(dir, 'c.jpg', JPEG);
  const err = await runGuard(images, { files: [fakeFile(a, 'image/png'), fakeFile(b, 'image/png'), fakeFile(c, 'image/jpeg')] });
  assert.equal(err.statusCode, 415);
  assert.deepEqual([a, b, c].map((p) => fs.existsSync(p)), [false, false, false]);
});

test('discardUploadsOnFailure deletes files of rejected requests only', async () => {
  const dir = tmpdir();
  for (const [status, shouldExist] of [[403, false], [404, false], [400, false], [500, false], [201, true], [200, true]]) {
    const p = writeFile(dir, `f-${status}.pdf`, PDF);
    const res = new EventEmitter(); res.statusCode = 0;
    const req = { file: fakeFile(p, 'application/pdf') };
    await new Promise((resolve) => guards.discardUploadsOnFailure(req, res, resolve));
    res.statusCode = status; res.emit('finish');
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(fs.existsSync(p), shouldExist, `status ${status}`);
  }
});

test('error handler maps multer errors and never leaks internals on 5xx', () => {
  const multerErr = (code) => Object.assign(new Error(code), { name: 'MulterError', code });
  assert.equal(statusAndMessage(multerErr('LIMIT_FILE_SIZE')).statusCode, 413);
  assert.equal(statusAndMessage(multerErr('LIMIT_FILE_COUNT')).statusCode, 400);
  assert.equal(statusAndMessage(multerErr('LIMIT_UNEXPECTED_FILE')).statusCode, 400);
  assert.equal(statusAndMessage(multerErr('SOMETHING_ELSE')).statusCode, 400);
  assert.deepEqual(statusAndMessage(safety.uploadError(415, 'Only PDFs')), { statusCode: 415, message: 'Only PDFs' });
  const sql = statusAndMessage(new Error("ER_BAD_FIELD_ERROR: Unknown column 'x' in 'field list'"));
  assert.deepEqual(sql, { statusCode: 500, message: 'Internal server error' });
  assert.equal(statusAndMessage(Object.assign(new Error('boom'), { statusCode: 503 })).message, 'Internal server error');
});
