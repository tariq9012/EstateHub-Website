// src/utils/asyncHandler.js
// Wraps an async controller so a thrown/rejected error is forwarded to
// next(err) automatically, instead of every controller needing its own
// try/catch. Used as: router.get('/x', asyncHandler(controllerFn))

function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;