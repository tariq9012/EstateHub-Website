// src/routes/admin.routes.js

const express = require('express');
const adminController = require('../controllers/admin.controller');
const systemNotificationSettingsController = require('../controllers/systemNotificationSettings.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const requirePermission = require('../middleware/requirePermission');
const validateRequest = require('../middleware/validateRequest');
const {
  updateUserStatusValidator,
  listPropertiesValidator,
  listUsersValidator,
} = require('../validators/admin.validator');
const { updateSettingValidator } = require('../validators/notificationSettings.validator');

const router = express.Router();

// Everything under /api/admin requires an authenticated admin.
router.use(authenticate, authorize('admin'));

router.get('/dashboard-stats', adminController.getDashboardStats);

router.get('/properties', listPropertiesValidator, validateRequest, adminController.listProperties);

router.get('/users', listUsersValidator, validateRequest, adminController.listUsers);
// User status changes (suspend/reactivate/deactivate) are super_admin only — moderator/support are
// not given this power (see requirePermission.js for the documented permission matrix).
router.put(
  '/users/:id/status',
  requirePermission('super_admin'),
  updateUserStatusValidator,
  validateRequest,
  adminController.updateUserStatus
);

router.get('/action-log', adminController.listActionLog);

router.get('/notification-settings', systemNotificationSettingsController.listSettings);
// System-wide notification triggers are super_admin only.
router.put(
  '/notification-settings/:eventKey',
  requirePermission('super_admin'),
  updateSettingValidator,
  validateRequest,
  systemNotificationSettingsController.updateSetting
);

module.exports = router;
