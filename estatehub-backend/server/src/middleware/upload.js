// src/middleware/upload.js
// multer disk-storage configs for the kinds of files EstateHub accepts: property photos,
// agent verification/renewal documents, avatars. Files are written to /server/uploads/<kind>/
// and served statically from /uploads/<kind>/<filename> (wired in app.js).
//
// Safety rules live in utils/uploadSafety.js and middleware/uploadGuards.js:
//   * stored name = 128-bit random hex + an extension derived from the validated type
//     (the client's filename/extension is never used)
//   * content is verified by magic bytes after upload (spoofed Content-Type is rejected)
//   * files of a request that is later rejected are deleted (no orphans)
//
// Use the ready-made chains (propertyImageUpload / documentUpload) in routes — they include those guards.

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const {
  IMAGE_MIMES,
  DOCUMENT_MIMES,
  makeFileFilter,
  randomFilenameCallback,
} = require('../utils/uploadSafety');
const { discardUploadsOnFailure, validateUploadedFiles } = require('./uploadGuards');

const { UPLOAD_ROOT } = require('../config/paths');

const storage = require('../services/storage');
const { failure } = require('../utils/apiResponse');

// Local disk is only used in development. On Vercel the filesystem is read-only, so creating folders
// there would crash the function at import time — and in R2 mode nothing is ever written locally.
if (storage.getUploadMode() === 'multipart') {
  ['properties', 'documents', 'avatars'].forEach((sub) => {
    try {
      fs.mkdirSync(path.join(UPLOAD_ROOT, sub), { recursive: true });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[upload] could not create ${sub} upload folder: ${err.message}`);
    }
  });
}

/** In R2 mode the multipart routes are closed: files must go browser -> R2 via the /direct/* endpoints. */
function rejectWhenDirect(req, res, next) {
  if (storage.getUploadMode() === 'direct') {
    return failure(res, 'This server uses direct uploads. Use the /direct/presign and /direct/complete endpoints.', 409, {
      code: 'DIRECT_UPLOAD_REQUIRED',
    });
  }
  return next();
}

function destinationFor(subfolder) {
  return function (req, file, cb) {
    cb(null, path.join(UPLOAD_ROOT, subfolder));
  };
}

const storageFor = (subfolder) => multer.diskStorage({ destination: destinationFor(subfolder), filename: randomFilenameCallback });

const imageFileFilter = makeFileFilter(IMAGE_MIMES, 'Only image files (JPEG, PNG, WebP, GIF) are allowed.');
const documentFileFilter = makeFileFilter(DOCUMENT_MIMES, 'Only PDF, JPEG or PNG files are allowed for documents.');

const uploadPropertyImages = multer({
  storage: storageFor('properties'),
  fileFilter: imageFileFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 20 },
});

const uploadVerificationDocument = multer({
  storage: storageFor('documents'),
  fileFilter: documentFileFilter,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

const uploadAvatar = multer({
  storage: storageFor('avatars'),
  fileFilter: imageFileFilter,
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
});

/** field "images" (up to 20 files). */
const propertyImageUpload = [rejectWhenDirect, discardUploadsOnFailure, uploadPropertyImages.array('images', 20), validateUploadedFiles(IMAGE_MIMES)];
/** field "document" (single file). */
const documentUpload = [rejectWhenDirect, discardUploadsOnFailure, uploadVerificationDocument.single('document'), validateUploadedFiles(DOCUMENT_MIMES)];

module.exports = {
  UPLOAD_ROOT,
  uploadPropertyImages,
  uploadVerificationDocument,
  uploadAvatar,
  propertyImageUpload,
  documentUpload,
};
