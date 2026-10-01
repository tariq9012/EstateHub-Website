// src/validators/appointment.validator.js
//
// Shape/type checks only. Time rules (must carry a timezone, must be in the future,
// not too far ahead) live in utils/appointmentRules.js and are enforced in the
// controller so the API can return specific, user-friendly messages.

const { body, param } = require('express-validator');
const { STATUSES, MIN_DURATION_MINUTES, MAX_DURATION_MINUTES } = require('../utils/appointmentRules');

const createAppointmentValidator = [
  body('propertyId').isInt({ min: 1 }).withMessage('propertyId is required').toInt(),
  body('scheduledAt').isString().notEmpty().withMessage('scheduledAt is required'),
  body('durationMinutes')
    .optional({ checkFalsy: true })
    .isInt({ min: MIN_DURATION_MINUTES, max: MAX_DURATION_MINUTES })
    .withMessage(`durationMinutes must be between ${MIN_DURATION_MINUTES} and ${MAX_DURATION_MINUTES}`)
    .toInt(),
  body('notes').optional({ checkFalsy: true }).isString().isLength({ max: 1000 }),
];

const updateAppointmentStatusValidator = [
  param('id').isInt({ min: 1 }).withMessage('Invalid appointment id'),
  body('status').isIn(STATUSES).withMessage('Invalid appointment status'),
];

module.exports = { createAppointmentValidator, updateAppointmentStatusValidator };
