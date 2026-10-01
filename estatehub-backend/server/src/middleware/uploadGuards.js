// src/middleware/uploadGuards.js
//
// Express middleware that runs around multer (no multer import here, so it is testable):
//   discardUploadsOnFailure  - FIRST in the chain. If the request ends with any 4xx/5xx status, every
//                              file multer already wrote to disk for it is deleted (no orphaned uploads
//                              when a later check rejects the request).
//   validateUploadedFiles    - AFTER multer. Verifies each file's real content (magic bytes) matches an
//                              allowed type AND the type it declared; otherwise deletes them and rejects.

const fs = require('node:fs');
const { detectMimeFromBuffer, uploadError } = require('../utils/uploadSafety');

function collectFiles(req) {
  if (req.file) return [req.file];
  if (Array.isArray(req.files)) return req.files;
  if (req.files && typeof req.files === 'object') return Object.values(req.files).flat();
  return [];
}

async function removeFiles(files) {
  await Promise.all(
    files.map((file) =>
      file && file.path ? fs.promises.unlink(file.path).catch(() => {}) : Promise.resolve()
    )
  );
}

function discardUploadsOnFailure(req, res, next) {
  res.on('finish', () => {
    if (res.statusCode >= 400) removeFiles(collectFiles(req));
  });
  next();
}

async function readHead(filePath, length = 16) {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

function validateUploadedFiles(allowedMimes) {
  return async function validate(req, res, next) {
    const files = collectFiles(req);
    try {
      for (const file of files) {
        if (!file.size) throw uploadError(400, 'The uploaded file is empty.');
        const detected = detectMimeFromBuffer(await readHead(file.path));
        if (!detected || !allowedMimes.includes(detected)) {
          throw uploadError(415, 'That file is not an accepted type. Its contents do not match an allowed format.');
        }
        if (detected !== file.mimetype) {
          throw uploadError(415, 'The file contents do not match its declared type.');
        }
      }
      return next();
    } catch (err) {
      await removeFiles(files);
      return next(err);
    }
  };
}

module.exports = { collectFiles, removeFiles, discardUploadsOnFailure, validateUploadedFiles };
