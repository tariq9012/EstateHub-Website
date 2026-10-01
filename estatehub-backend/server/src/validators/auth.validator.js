// src/validators/auth.validator.js

const { body } = require('express-validator');
const { passwordRule } = require('../utils/passwordPolicy');

const registerValidator = [
  body('email').isEmail().withMessage('A valid email is required').normalizeEmail(),
  passwordRule('password'),
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('phone').optional({ checkFalsy: true }).isString().trim(),
  body('role')
    .optional()
    .isIn(['buyer', 'agent'])
    .withMessage('Role must be "buyer" or "agent" (admin accounts cannot self-register)'),
  body('licenseNumber')
    .if(body('role').equals('agent'))
    .trim()
    .notEmpty()
    .withMessage('License number is required to register as an agent'),
  body('agencyName').optional({ checkFalsy: true }).isString().trim(),
  body('specialty').optional({ checkFalsy: true }).isString().trim(),
  body('yearsExperience').optional({ checkFalsy: true }).isInt({ min: 0 }).toInt(),
];

const loginValidator = [
  body('email').isEmail().withMessage('A valid email is required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
];

const forgotPasswordValidator = [
  body('email').isEmail().withMessage('A valid email is required').normalizeEmail(),
];

const resetPasswordValidator = [
  body('token').isString().trim().notEmpty().withMessage('Reset token is required'),
  passwordRule('newPassword'),
];

module.exports = { registerValidator, loginValidator, forgotPasswordValidator, resetPasswordValidator };