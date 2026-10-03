// src/services/storage/localDriver.js
//
// Local-disk driver for development (STORAGE_DRIVER=local, the default). Uploads still go through the
// existing multer disk-storage pipeline (middleware/upload.js), and references stay '/uploads/<sub>/<file>',
// so local behavior is unchanged. This driver only implements the parts the controllers share with R2:
// deleting a stored file and locating a private document on disk.

const { UPLOAD_ROOT } = require('../../config/paths');
const { deleteStoredFile, resolveStoredFile } = require('../../utils/uploadSafety');

function createLocalDriver({ uploadRoot = UPLOAD_ROOT } = {}) {
  return {
    name: 'local',
    mode: 'multipart',
    deleteLocalReference: (reference) => deleteStoredFile(uploadRoot, reference),
    resolveLocalReference: (reference) => resolveStoredFile(uploadRoot, reference),
  };
}

module.exports = { createLocalDriver };
