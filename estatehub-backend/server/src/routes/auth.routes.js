// src/routes/auth.routes.js

const express = require('express');
const authController = require('../controllers/auth.controller');
const {
  registerValidator,
  loginValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
} = require('../validators/auth.validator');
const validateRequest = require('../middleware/validateRequest');
const authenticate = require('../middleware/authenticate');
const { authLimiter } = require('../middleware/rateLimiter');
const { requireTrustedOrigin } = require('../middleware/trustedOrigin');

const router = express.Router();

router.post('/register', authLimiter, registerValidator, validateRequest, authController.register);
router.post('/login', authLimiter, loginValidator, validateRequest, authController.login);
// Rate-limited too: an unlimited /refresh would otherwise be a way around the login limiter for
// anyone who has (or is brute-forcing) a refresh-token cookie.
router.post('/refresh', requireTrustedOrigin, authLimiter, authController.refresh);
router.post('/logout', requireTrustedOrigin, authController.logout);
router.get('/me', authenticate, authController.me);

router.post(
  '/forgot-password',
  authLimiter,
  forgotPasswordValidator,
  validateRequest,
  authController.forgotPassword
);
router.post(
  '/reset-password',
  authLimiter,
  resetPasswordValidator,
  validateRequest,
  authController.resetPassword
);

module.exports = router;