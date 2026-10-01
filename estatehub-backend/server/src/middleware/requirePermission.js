// src/middleware/requirePermission.js
// Enforces the admin_users.permission_level matrix. Runs AFTER authenticate + authorize('admin').
//
// Permission matrix (documented here since there is no UI/API in this codebase to assign or change
// an admin's permission_level — that column is seeded/managed directly in the database):
//   super_admin — full admin access, including user status changes and system notification settings.
//   moderator   — property moderation, agent verification, and license renewal review.
//   support     — read-only / support-oriented admin endpoints (no destructive moderation actions).
//
// Usage: router.put('/:id/approve', authenticate, authorize('admin'), requirePermission('super_admin', 'moderator'), ctrl.approve)

const adminUserModel = require('../models/adminUser.model');
const { failure } = require('../utils/apiResponse');

function requirePermission(...allowedLevels) {
  return async function checkPermission(req, res, next) {
    try {
      const admin = await adminUserModel.findByUserId(req.user.userId);
      if (!admin) return failure(res, 'Admin profile not found for this account', 403);

      if (!allowedLevels.includes(admin.permission_level)) {
        return failure(res, 'Your admin permission level does not allow this action', 403);
      }

      req.admin = admin; // downstream controllers may reuse this instead of re-querying
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = requirePermission;
