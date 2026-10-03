// src/middleware/directUpload.js
//
// Used on the "complete" half of a browser-direct upload (STORAGE_DRIVER=r2). It runs AFTER authenticate and
// the same ownership checks as the legacy multipart routes, and BEFORE the existing controller:
//
//   1. the client sends { uploads: [{ key, contentType }] } — the pending keys it received from "presign";
//   2. every key must parse as a pending key of the expected kind AND belong to the owner resolved on the
//      server (property id / the caller's own agent id) — a key issued for someone else is rejected;
//   3. the bytes are validated (size, magic bytes, declared type) and promoted by the storage service;
//   4. req.files / req.file is populated so the EXISTING controller (caps, status rules, DB insert) runs unchanged.
//
// If the request ends in a 4xx/5xx afterwards (e.g. the photo cap), the promoted objects are deleted again,
// mirroring discardUploadsOnFailure for the legacy path.

const path = require('node:path');
const storage = require('../services/storage');
const { getPolicy } = require('../services/storage/policy');
const { uploadError } = require('../utils/uploadSafety');

const ARRAY_KINDS = new Set(['property-image']);

function parseUploadsBody(req, policy) {
  const uploads = req.body && req.body.uploads;
  if (!Array.isArray(uploads) || uploads.length === 0) throw uploadError(400, 'No uploaded files were reported.');
  if (uploads.length > policy.maxPerRequest) throw uploadError(400, 'Too many files in one request.');
  const seen = new Set();
  return uploads.map((u) => {
    if (!u || typeof u.key !== 'string' || typeof u.contentType !== 'string') throw uploadError(400, 'Invalid upload reference.');
    if (seen.has(u.key)) throw uploadError(400, 'Duplicate upload reference.');
    seen.add(u.key);
    return { key: u.key, contentType: u.contentType };
  });
}

/**
 * @param {string} kind                         storage kind (see services/storage/policy.js)
 * @param {(req, res) => Promise<number|null>} resolveOwnerId  returns the server-side owner id, or null after sending a response
 */
function finalizeDirectUploads(kind, resolveOwnerId) {
  const policy = getPolicy(kind);
  return async function finalizeDirect(req, res, next) {
    const promoted = [];
    let pendingKeys = [];
    try {
      if (storage.getUploadMode() !== 'direct') throw uploadError(409, 'Direct uploads are not enabled.');
      const uploads = parseUploadsBody(req, policy);
      const ownerId = await resolveOwnerId(req, res);
      if (ownerId === null || ownerId === undefined) return undefined; // resolver already responded

      for (const u of uploads) {
        const parsed = storage.parsePendingKey(u.key);
        if (!parsed || parsed.kind !== kind || parsed.ownerId !== Number(ownerId)) {
          throw uploadError(400, 'Invalid upload reference.');
        }
      }
      pendingKeys = uploads.map((u) => u.key);

      for (const u of uploads) {
        // eslint-disable-next-line no-await-in-loop
        promoted.push(await storage.finalizeUpload({ kind, pendingKey: u.key, declaredContentType: u.contentType }));
      }

      const files = promoted.map((r) => ({
        filename: path.posix.basename(r.key),
        storedRef: r.reference,
        size: r.size,
        mimetype: r.contentType,
      }));
      if (ARRAY_KINDS.has(kind)) req.files = files;
      else [req.file] = files;

      res.on('finish', () => {
        if (res.statusCode >= 400) files.forEach((f) => storage.deleteByReference(f.storedRef));
      });
      return next();
    } catch (err) {
      // Remove anything we already promoted, and any pending objects not yet processed.
      await Promise.all(promoted.map((r) => storage.deleteByReference(r.reference)));
      const done = new Set(promoted.map((r) => `pending/${r.key}`));
      await Promise.all(
        pendingKeys.filter((k) => !done.has(k)).map((k) => storage.deletePending(k).catch(() => false))
      );
      return next(err);
    }
  };
}

module.exports = { finalizeDirectUploads };
