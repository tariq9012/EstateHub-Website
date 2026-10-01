// src/utils/uploadSafety.js
//
// Dependency-free helpers for safe file uploads. Everything multer's config calls lives
// here so it can be unit-tested without multer installed.
//
// Threats handled:
//  - Client-chosen extension  -> the stored extension is derived from the validated type, never from
//    the original filename (an "evil.html" sent as image/png can no longer be stored/served as HTML).
//  - Spoofed Content-Type     -> the first bytes ("magic numbers") must match an allowed type.
//  - Guessable filenames      -> 128 bits from crypto.randomBytes.
//  - Path traversal on delete -> stored URLs are re-resolved and must stay inside the upload root.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const FILE_TYPES = Object.freeze({
  'image/jpeg': { ext: '.jpg' },
  'image/png': { ext: '.png' },
  'image/webp': { ext: '.webp' },
  'image/gif': { ext: '.gif' },
  'application/pdf': { ext: '.pdf' },
});

const IMAGE_MIMES = Object.freeze(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const DOCUMENT_MIMES = Object.freeze(['application/pdf', 'image/jpeg', 'image/png']);
const UPLOAD_SUBFOLDERS = Object.freeze(['properties', 'documents', 'avatars']);

function uploadError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

/** Identifies a file type from its leading bytes. Returns a MIME string or null. */
function detectMimeFromBuffer(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 5) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  const head6 = buf.subarray(0, 6).toString('latin1');
  if (head6 === 'GIF87a' || head6 === 'GIF89a') return 'image/gif';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  return null;
}

/** Random, extension-safe name. The extension comes from the (already validated) MIME type. */
function safeFilename(mimeType) {
  const type = FILE_TYPES[mimeType];
  if (!type) throw uploadError(415, 'Unsupported file type');
  return `${crypto.randomBytes(16).toString('hex')}${type.ext}`;
}

/** multer fileFilter: rejects (HTTP 415) anything whose declared type is not allowed. */
function makeFileFilter(allowedMimes, message) {
  return (req, file, cb) => {
    if (allowedMimes.includes(file.mimetype)) return cb(null, true);
    return cb(uploadError(415, message));
  };
}

/** multer filename(): random name + extension derived from the validated type. */
function randomFilenameCallback(req, file, cb) {
  try {
    cb(null, safeFilename(file.mimetype));
  } catch (err) {
    cb(err);
  }
}

/**
 * Turns a stored URL like "/uploads/documents/abc.pdf" back into an absolute path
 * INSIDE the upload root — or null if it isn't one of ours (path traversal, other host, etc).
 */
function resolveStoredFile(uploadRoot, fileUrl) {
  if (typeof fileUrl !== 'string') return null;
  const match = /^\/uploads\/([a-z]+)\/([A-Za-z0-9._-]+)$/.exec(fileUrl);
  if (!match) return null;
  const [, sub, name] = match;
  if (!UPLOAD_SUBFOLDERS.includes(sub) || name === '.' || name === '..') return null;
  const root = path.resolve(uploadRoot);
  const absolute = path.resolve(root, sub, name);
  if (!absolute.startsWith(root + path.sep)) return null;
  return absolute;
}

/** Best-effort removal of a stored upload. Never throws; returns true if a file was removed. */
async function deleteStoredFile(uploadRoot, fileUrl) {
  const absolute = resolveStoredFile(uploadRoot, fileUrl);
  if (!absolute) return false;
  try {
    await fs.promises.unlink(absolute);
    return true;
  } catch (err) {
    return false; // already gone / not permitted: nothing more we can do
  }
}

module.exports = {
  FILE_TYPES,
  IMAGE_MIMES,
  DOCUMENT_MIMES,
  UPLOAD_SUBFOLDERS,
  uploadError,
  detectMimeFromBuffer,
  safeFilename,
  makeFileFilter,
  randomFilenameCallback,
  resolveStoredFile,
  deleteStoredFile,
};
