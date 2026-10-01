// src/validators/agent.validator.js

const { body, query } = require('express-validator');

const updateAgentProfileValidator = [
  body('agencyName').optional({ checkFalsy: true }).isString().trim(),
  body('specialty').optional({ checkFalsy: true }).isString().trim(),
  body('yearsExperience').optional({ checkFalsy: true }).isInt({ min: 0 }).toInt(),
  body('bio').optional({ checkFalsy: true }).isString().isLength({ max: 2000 }),
  body('companyWebsite').optional({ checkFalsy: true }).isURL().withMessage('companyWebsite must be a valid URL'),
  body('officeAddress').optional({ checkFalsy: true }).isString().trim(),
  body('licenseExpiryDate')
    .optional({ checkFalsy: true })
    .isISO8601({ strict: true })
    .withMessage('licenseExpiryDate must be a valid date (YYYY-MM-DD)')
    .custom((value) => {
      const date = new Date(value);
      const min = new Date('1990-01-01');
      const max = new Date();
      max.setFullYear(max.getFullYear() + 15);
      if (date < min || date > max) throw new Error('licenseExpiryDate is out of a plausible range');
      return true;
    }),
];

const createReviewValidator = [
  body('rating').isInt({ min: 1, max: 5 }).withMessage('rating must be between 1 and 5').toInt(),
  body('comment').optional({ checkFalsy: true }).isString().isLength({ max: 2000 }),
];

const listAgentsValidator = [
  query('specialty').optional().isString(),
  query('minRating').optional().isFloat({ min: 0, max: 5 }).toFloat(),
  query('verifiedOnly').optional().isBoolean(),
  query('keyword').optional().isString().trim(),
  query('city').optional().isString().trim(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
];

module.exports = { updateAgentProfileValidator, createReviewValidator, listAgentsValidator };