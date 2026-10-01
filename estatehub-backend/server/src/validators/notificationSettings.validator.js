// src/validators/notificationSettings.validator.js

const { body } = require('express-validator');

const updateSettingValidator = [
  body('description').optional({ checkFalsy: true }).isString(),
  body('emailEnabled').optional().isBoolean().toBoolean(),
  body('smsEnabled').optional().isBoolean().toBoolean(),
];

module.exports = { updateSettingValidator };
