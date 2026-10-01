// src/validators/inquiry.validator.js

const { body } = require('express-validator');

const createInquiryValidator = [
  body('propertyId').isInt({ min: 1 }).withMessage('propertyId is required').toInt(),
  body('message').trim().notEmpty().withMessage('Message is required').isLength({ max: 2000 }),
  body('preferredVisitDate').optional({ checkFalsy: true }).isISO8601(),
];

const updateInquiryStatusValidator = [
  body('status').isIn(['new', 'contacted', 'closed']).withMessage('status must be new, contacted, or closed'),
];

module.exports = { createInquiryValidator, updateInquiryStatusValidator };
