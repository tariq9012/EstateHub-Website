// src/controllers/admin.controller.js

const adminModel = require('../models/admin.model');
const userModel = require('../models/user.model');
const adminUserModel = require('../models/adminUser.model');
const adminActionLogModel = require('../models/adminActionLog.model');
const notificationModel = require('../models/notification.model');
const asyncHandler = require('../utils/asyncHandler');
const { success, failure } = require('../utils/apiResponse');

/**
 * GET /api/admin/dashboard-stats
 */
const getDashboardStats = asyncHandler(async (req, res) => {
  const stats = await adminModel.getDashboardStats();
  return success(res, stats, 200);
});

/**
 * GET /api/admin/properties
 * Every status, unlike the public /api/properties which is 'active'-only.
 */
const listProperties = asyncHandler(async (req, res) => {
  const { status, listingType, search, page, limit } = req.query;
  const result = await adminModel.listAllProperties({ status, listingType, search, page, limit });
  return success(res, result, 200);
});

/**
 * GET /api/admin/users
 */
const listUsers = asyncHandler(async (req, res) => {
  const { role, status, search, page, limit } = req.query;
  const result = await adminModel.listAllUsers({ role, status, search, page, limit });
  return success(res, result, 200);
});

/**
 * PUT /api/admin/users/:id/status
 * Suspend / reactivate / deactivate a user account.
 */
const updateUserStatus = asyncHandler(async (req, res) => {
  const userId = Number(req.params.id);
  const { status } = req.body;

  const targetUser = await userModel.findById(userId);
  if (!targetUser) return failure(res, 'User not found', 404);

  const admin = await adminUserModel.findByUserId(req.user.userId);
  if (!admin) return failure(res, 'Admin profile not found for this account', 403);

  // An admin can never change their own account status through this endpoint (avoids accidental
  // or malicious self-lockout / self-escalation).
  if (userId === req.user.userId) {
    return failure(res, 'You cannot change your own account status.', 409, { code: 'SELF_TARGET' });
  }
  // Only a super_admin may act on another admin's account — a moderator/support admin escalating
  // or disabling a peer (or a super_admin) is exactly the "forged permission level" risk this
  // guards against.
  if (targetUser.role === 'admin' && admin.permission_level !== 'super_admin') {
    return failure(res, "Only a super admin can change another admin's account status.", 403);
  }

  await adminModel.updateUserStatus(userId, status);
  await adminActionLogModel.logAction({
    adminId: admin.admin_id,
    actionType: `user_status_${status}`,
    targetType: 'user',
    targetId: userId,
  });
  await notificationModel.create({
    userId,
    type: 'account_status',
    title: `Your account status changed to ${status}`,
  });

  const updated = await userModel.findById(userId);
  return success(res, { user: userModel.toSafeUser(updated) }, 200);
});

/**
 * GET /api/admin/action-log
 */
const listActionLog = asyncHandler(async (req, res) => {
  const { targetType, page, limit } = req.query;
  const result = await adminModel.listActionLog({ targetType, page, limit });
  return success(res, result, 200);
});

module.exports = { getDashboardStats, listProperties, listUsers, updateUserStatus, listActionLog };
