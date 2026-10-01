// src/validators/property.validator.js

const { body, query } = require('express-validator');

const createPropertyValidator = [
  body('typeId').isInt({ min: 1 }).withMessage('typeId is required').toInt(),
  body('title').trim().isLength({ min: 3, max: 200 }).withMessage('Title must be 3-200 characters'),
  body('description').optional({ checkFalsy: true }).isString(),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number').toFloat(),
  body('listingType').optional().isIn(['sale', 'rent']).withMessage('listingType must be "sale" or "rent"'),
  body('bedrooms').optional({ checkFalsy: true }).isInt({ min: 0 }).toInt(),
  body('bathrooms').optional({ checkFalsy: true }).isFloat({ min: 0 }).toFloat(),
  body('areaSqft').optional({ checkFalsy: true }).isInt({ min: 0 }).toInt(),
  body('lotSizeSqft').optional({ checkFalsy: true }).isInt({ min: 0 }).toInt(),
  body('yearBuilt').optional({ checkFalsy: true }).isInt({ min: 1800, max: 2100 }).toInt(),
  body('addressLine').trim().notEmpty().withMessage('Address is required'),
  body('postalCode').optional({ checkFalsy: true }).isString(),
  body('latitude').optional({ checkFalsy: true }).isFloat({ min: -90, max: 90 }).toFloat(),
  body('longitude').optional({ checkFalsy: true }).isFloat({ min: -180, max: 180 }).toFloat(),
  body('city').trim().notEmpty().withMessage('City is required'),
  body('country').trim().notEmpty().withMessage('Country is required'),
  body('neighborhood').optional({ checkFalsy: true }).isString(),
  body('state').optional({ checkFalsy: true }).isString(),
  body('saveAsDraft').optional().isBoolean().toBoolean(),
];

const updatePropertyValidator = [
  body('typeId').optional().isInt({ min: 1 }).toInt(),
  body('title').optional().trim().isLength({ min: 3, max: 200 }),
  body('description').optional({ checkFalsy: true }).isString(),
  body('price').optional().isFloat({ min: 0 }).toFloat(),
  body('listingType').optional().isIn(['sale', 'rent']),
  body('bedrooms').optional({ checkFalsy: true }).isInt({ min: 0 }).toInt(),
  body('bathrooms').optional({ checkFalsy: true }).isFloat({ min: 0 }).toFloat(),
  body('areaSqft').optional({ checkFalsy: true }).isInt({ min: 0 }).toInt(),
  body('lotSizeSqft').optional({ checkFalsy: true }).isInt({ min: 0 }).toInt(),
  body('yearBuilt').optional({ checkFalsy: true }).isInt({ min: 1800, max: 2100 }).toInt(),
  body('addressLine').optional().trim().notEmpty(),
  body('postalCode').optional({ checkFalsy: true }).isString(),
  body('latitude').optional({ checkFalsy: true }).isFloat({ min: -90, max: 90 }).toFloat(),
  body('longitude').optional({ checkFalsy: true }).isFloat({ min: -180, max: 180 }).toFloat(),
  body('city').optional().trim().notEmpty(),
  body('country').optional().trim().notEmpty(),
  body('neighborhood').optional({ checkFalsy: true }).isString(),
  body('state').optional({ checkFalsy: true }).isString(),
  body('submitForReview').optional().isBoolean().toBoolean(),
];

const listPropertiesValidator = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  query('typeId').optional().isInt({ min: 1 }).toInt(),
  query('listingType').optional().isIn(['sale', 'rent']),
  query('minPrice').optional().isFloat({ min: 0 }).toFloat(),
  query('maxPrice').optional().isFloat({ min: 0 }).toFloat(),
  query('minBedrooms').optional().isInt({ min: 0 }).toInt(),
  query('minBathrooms').optional().isFloat({ min: 0 }).toFloat(),
  query('minYearBuilt').optional().isInt({ min: 1800 }).toInt(),
  query('maxYearBuilt').optional().isInt({ min: 1800 }).toInt(),
  // Comma-separated list, e.g. "active,under_contract,sold". Values outside the public
  // whitelist are silently dropped by the controller, not rejected here — this just bounds
  // the string shape.
  query('status').optional().isString().trim().isLength({ max: 100 }),
  query('city').optional().isString().trim(),
  query('agentId').optional().isInt({ min: 1 }).toInt(),
  query('sortBy').optional().isIn(['newest', 'oldest', 'price_asc', 'price_desc']),
  query('amenities').optional().isString(),
  query('keyword').optional().isString().trim(),
];

const rejectPropertyValidator = [body('reason').trim().notEmpty().withMessage('Rejection reason is required')];

const createPropertyReviewValidator = [
  body('rating').isInt({ min: 1, max: 5 }).withMessage('rating must be between 1 and 5').toInt(),
  body('comment').optional({ checkFalsy: true }).isString().isLength({ max: 2000 }),
];

const setAmenitiesValidator = [
  body('amenityIds').isArray().withMessage('amenityIds must be an array'),
  body('amenityIds.*').isInt({ min: 1 }).withMessage('Each amenityId must be a positive integer'),
];

module.exports = {
  createPropertyValidator,
  updatePropertyValidator,
  listPropertiesValidator,
  rejectPropertyValidator,
  setAmenitiesValidator,
  createPropertyReviewValidator,
};