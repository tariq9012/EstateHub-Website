// src/routes/inquiry.routes.js

const express = require('express');
const inquiryController = require('../controllers/inquiry.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validateRequest = require('../middleware/validateRequest');
const { createInquiryValidator, updateInquiryStatusValidator } = require('../validators/inquiry.validator');

const router = express.Router();

router.post('/', authenticate, createInquiryValidator, validateRequest, inquiryController.createInquiry);
router.get('/me', authenticate, inquiryController.getMyInquiries);
router.get('/received', authenticate, authorize('agent'), inquiryController.getReceivedInquiries);
router.put(
  '/:id/status',
  authenticate,
  updateInquiryStatusValidator,
  validateRequest,
  inquiryController.updateInquiryStatus
);

module.exports = router;
