// src/middleware/validateRequest.js
// Runs after a route's express-validator chain (e.g. from
// src/validators/*.js) and short-circuits with a 422 if any rule failed.

const { validationResult } = require('express-validator');
const { failure } = require('../utils/apiResponse');

function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return failure(res, 'Validation failed', 422, errors.array());
  }
  return next();
}

module.exports = validateRequest;