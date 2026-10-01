// src/validators/user.validator.js

const { body } = require('express-validator');

const updateProfileValidator = [
  body('bio').optional({ checkFalsy: true }).isString().isLength({ max: 2000 }),
  body('addressLine').optional({ checkFalsy: true }).isString().trim(),
  body('city').optional({ checkFalsy: true }).isString().trim(),
  body('state').optional({ checkFalsy: true }).isString().trim(),
  body('country').optional({ checkFalsy: true }).isString().trim(),
  body('postalCode').optional({ checkFalsy: true }).isString().trim(),
  body('dateOfBirth')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('dateOfBirth must be a valid date (YYYY-MM-DD)'),
];

const updateNotificationPreferencesValidator = [
  body('emailNotifications').optional().isBoolean().toBoolean(),
  body('smsNotifications').optional().isBoolean().toBoolean(),
  body('pushNotifications').optional().isBoolean().toBoolean(),
];

module.exports = { updateProfileValidator, updateNotificationPreferencesValidator };
