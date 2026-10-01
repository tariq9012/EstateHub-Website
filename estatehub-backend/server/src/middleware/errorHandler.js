// src/middleware/errorHandler.js
// Centralized error handler — any error passed to next(err) lands here.

const { failure } = require('../utils/apiResponse');

/** multer's own errors carry a code but no HTTP status: map them to sensible ones. */
function statusAndMessage(err) {
  if (err && err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') return { statusCode: 413, message: 'That file is too large.' };
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
      return { statusCode: 400, message: 'Too many files, or an unexpected file field.' };
    }
    return { statusCode: 400, message: 'The upload could not be processed.' };
  }
  const statusCode = err.statusCode || 500;
  // Never leak internal error text (SQL messages, stack details) for server errors.
  const message = statusCode >= 500 ? 'Internal server error' : err.message || 'Request failed';
  return { statusCode, message };
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // eslint-disable-next-line no-console
  console.error('[error]', err);
  const { statusCode, message } = statusAndMessage(err);
  return failure(res, message, statusCode);
}

function notFoundHandler(req, res) {
  return failure(res, `Route not found: ${req.method} ${req.originalUrl}`, 404);
}

module.exports = { errorHandler, notFoundHandler, statusAndMessage };
