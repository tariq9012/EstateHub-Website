// src/utils/apiResponse.js
// Small helpers so every endpoint returns the same { success, data, error } shape.

function success(res, data = null, statusCode = 200, meta = undefined) {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
}

function failure(res, message = 'Something went wrong', statusCode = 500, details = undefined) {
  const body = { success: false, error: message };
  if (details) body.details = details;
  return res.status(statusCode).json(body);
}

module.exports = { success, failure };