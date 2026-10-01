// src/controllers/notification.controller.js

const notificationModel = require('../models/notification.model');
const asyncHandler = require('../utils/asyncHandler');
const { success, failure } = require('../utils/apiResponse');

const listNotifications = asyncHandler(async (req, res) => {
  const { unreadOnly, limit } = req.query;
  const notifications = await notificationModel.listForUser(req.user.userId, {
    unreadOnly: unreadOnly === 'true',
    limit,
  });
  const unreadCount = await notificationModel.countUnread(req.user.userId);
  return success(res, { notifications, unreadCount }, 200);
});

const markNotificationRead = asyncHandler(async (req, res) => {
  const notificationId = Number(req.params.id);
  if (!Number.isInteger(notificationId)) return failure(res, 'Invalid notification id', 400);

  const updated = await notificationModel.markAsRead(notificationId, req.user.userId);
  if (!updated) return failure(res, 'Notification not found', 404);

  return success(res, { message: 'Marked as read' }, 200);
});

const markAllNotificationsRead = asyncHandler(async (req, res) => {
  await notificationModel.markAllAsRead(req.user.userId);
  return success(res, { message: 'All notifications marked as read' }, 200);
});

module.exports = { listNotifications, markNotificationRead, markAllNotificationsRead };
