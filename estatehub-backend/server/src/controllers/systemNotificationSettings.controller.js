// src/controllers/systemNotificationSettings.controller.js

const systemNotificationSettingsModel = require('../models/systemNotificationSettings.model');
const adminUserModel = require('../models/adminUser.model');
const asyncHandler = require('../utils/asyncHandler');
const { success, failure } = require('../utils/apiResponse');

/**
 * GET /api/admin/notification-settings
 */
const listSettings = asyncHandler(async (req, res) => {
  const settings = await systemNotificationSettingsModel.listAll();
  return success(res, { settings }, 200);
});

/**
 * PUT /api/admin/notification-settings/:eventKey
 * Creates the row if it doesn't exist yet (upsert).
 */
const updateSetting = asyncHandler(async (req, res) => {
  const { eventKey } = req.params;
  const { description, emailEnabled, smsEnabled } = req.body;

  const admin = await adminUserModel.findByUserId(req.user.userId);
  if (!admin) return failure(res, 'Admin profile not found for this account', 403);

  const setting = await systemNotificationSettingsModel.upsert(eventKey, {
    description,
    emailEnabled,
    smsEnabled,
    updatedBy: admin.admin_id,
  });

  return success(res, { setting }, 200);
});

module.exports = { listSettings, updateSetting };
