// src/controllers/user.controller.js

const userProfileModel = require('../models/userProfile.model');
const notificationPrefModel = require('../models/userNotificationPreference.model');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/apiResponse');

const getMyProfile = asyncHandler(async (req, res) => {
  const profile = await userProfileModel.findByUserId(req.user.userId);
  return success(res, { profile: profile || null }, 200);
});

const updateMyProfile = asyncHandler(async (req, res) => {
  const { bio, addressLine, city, state, country, postalCode, dateOfBirth } = req.body;
  const profile = await userProfileModel.upsert(req.user.userId, {
    bio,
    address_line: addressLine,
    city,
    state,
    country,
    postal_code: postalCode,
    date_of_birth: dateOfBirth,
  });
  return success(res, { profile }, 200);
});

const getMyNotificationPreferences = asyncHandler(async (req, res) => {
  const preferences = await notificationPrefModel.getOrCreateDefaults(req.user.userId);
  return success(res, { preferences }, 200);
});

const updateMyNotificationPreferences = asyncHandler(async (req, res) => {
  const { emailNotifications, smsNotifications, pushNotifications } = req.body;
  const preferences = await notificationPrefModel.update(req.user.userId, {
    email_notifications: emailNotifications,
    sms_notifications: smsNotifications,
    push_notifications: pushNotifications,
  });
  return success(res, { preferences }, 200);
});

module.exports = { getMyProfile, updateMyProfile, getMyNotificationPreferences, updateMyNotificationPreferences };
