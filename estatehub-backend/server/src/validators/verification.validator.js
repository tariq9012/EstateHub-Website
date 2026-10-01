// src/validators/verification.validator.js

const { body } = require('express-validator');

const rejectDocumentValidator = [body('reason').trim().notEmpty().withMessage('Rejection reason is required')];

module.exports = { rejectDocumentValidator };
