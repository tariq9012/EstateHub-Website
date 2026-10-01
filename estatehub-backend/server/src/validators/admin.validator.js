// src/validators/admin.validator.js

const { body, query } = require('express-validator');

const updateUserStatusValidator = [
  body('status').isIn(['active', 'pending', 'suspended', 'deactivated']).withMessage('Invalid status'),
];

const listPropertiesValidator = [
  query('status')
    .optional()
    .isIn(['draft', 'pending_review', 'active', 'under_contract', 'sold', 'rejected', 'archived']),
  query('listingType').optional().isIn(['sale', 'rent']),
  query('search').optional({ checkFalsy: true }).isString().trim().isLength({ max: 200 }),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];

const listUsersValidator = [
  query('role').optional().isIn(['buyer', 'agent', 'admin']),
  query('status').optional().isIn(['active', 'pending', 'suspended', 'deactivated']),
  query('search').optional({ checkFalsy: true }).isString().trim().isLength({ max: 200 }),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];

module.exports = { updateUserStatusValidator, listPropertiesValidator, listUsersValidator };
