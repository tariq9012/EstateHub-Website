// src/routes/user.routes.js

const express = require('express');
const userController = require('../controllers/user.controller');
const authenticate = require('../middleware/authenticate');
const validateRequest = require('../middleware/validateRequest');
const {
  updateProfileValidator,
  updateNotificationPreferencesValidator,
} = require('../validators/user.validator');

const router = express.Router();

router.get('/me/profile', authenticate, userController.getMyProfile);
router.put('/me/profile', authenticate, updateProfileValidator, validateRequest, userController.updateMyProfile);

router.get('/me/notification-preferences', authenticate, userController.getMyNotificationPreferences);
router.put(
  '/me/notification-preferences',
  authenticate,
  updateNotificationPreferencesValidator,
  validateRequest,
  userController.updateMyNotificationPreferences
);

module.exports = router;
