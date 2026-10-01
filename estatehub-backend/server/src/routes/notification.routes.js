// src/routes/notification.routes.js

const express = require('express');
const notificationController = require('../controllers/notification.controller');
const authenticate = require('../middleware/authenticate');

const router = express.Router();

router.get('/', authenticate, notificationController.listNotifications);
router.put('/read-all', authenticate, notificationController.markAllNotificationsRead);
router.put('/:id/read', authenticate, notificationController.markNotificationRead);

module.exports = router;
