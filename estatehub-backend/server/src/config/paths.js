// src/config/paths.js
// Filesystem locations shared by the upload middleware and the controllers that clean files up.
const path = require('node:path');

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');

module.exports = { UPLOAD_ROOT };
