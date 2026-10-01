// src/validators/licenseRenewal.validator.js

const { body } = require('express-validator');

const approveRenewalValidator = [
  body('newExpiryDate').isISO8601().withMessage('newExpiryDate must be a valid date (YYYY-MM-DD)'),
];

module.exports = { approveRenewalValidator };
