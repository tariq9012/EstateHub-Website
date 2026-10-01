// src/middleware/authorize.js
// Role guard, used after authenticate(). Usage:
//   router.put('/:id/approve', authenticate, authorize('admin'), ctrl.approve)

const { failure } = require('../utils/apiResponse');

function authorize(...allowedRoles) {
  return function checkRole(req, res, next) {
    if (!req.user) {
      return failure(res, 'Authentication required', 401);
    }
    if (!allowedRoles.includes(req.user.role)) {
      return failure(res, 'You do not have permission to perform this action', 403);
    }
    return next();
  };
}

module.exports = authorize;