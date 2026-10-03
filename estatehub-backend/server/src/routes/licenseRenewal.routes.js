// src/routes/licenseRenewal.routes.js

const express = require('express');
const licenseRenewalController = require('../controllers/licenseRenewal.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const requirePermission = require('../middleware/requirePermission');
const validateRequest = require('../middleware/validateRequest');
const { documentUpload } = require('../middleware/upload');
const { finalizeDirectUploads } = require('../middleware/directUpload');
const directUpload = require('../controllers/directUpload.controller');
const { approveRenewalValidator } = require('../validators/licenseRenewal.validator');

const router = express.Router();

// --- Agent ---
router.post('/', authenticate, authorize('agent'), licenseRenewalController.createRenewal);
router.get('/me', authenticate, authorize('agent'), licenseRenewalController.getMyRenewals);
router.post(
  '/:id/documents',
  authenticate,
  authorize('agent'),
  ...documentUpload,
  licenseRenewalController.uploadRenewalDocument
);
// Browser-direct (Cloudflare R2) variant — STORAGE_DRIVER=r2 only.
router.post(
  '/:id/documents/direct/presign',
  authenticate,
  authorize('agent'),
  directUpload.requireDirectMode,
  directUpload.presignRenewalDocument
);
router.post(
  '/:id/documents/direct/complete',
  authenticate,
  authorize('agent'),
  directUpload.requireDirectMode,
  finalizeDirectUploads('renewal-document', directUpload.resolveAgentOwner),
  licenseRenewalController.uploadRenewalDocument
);
router.delete(
  '/:id/documents/:documentId',
  authenticate,
  authorize('agent'),
  licenseRenewalController.deleteRenewalDocument
);
router.put('/:id/submit', authenticate, authorize('agent'), licenseRenewalController.submitRenewal);

// --- Admin --- (super_admin + moderator for decisions; support is read-only, see requirePermission.js)
router.get('/', authenticate, authorize('admin'), licenseRenewalController.listAllRenewals);
router.put(
  '/:id/under-review',
  authenticate,
  authorize('admin'),
  requirePermission('super_admin', 'moderator'),
  licenseRenewalController.moveToUnderReview
);
router.put(
  '/:id/approve',
  authenticate,
  authorize('admin'),
  requirePermission('super_admin', 'moderator'),
  approveRenewalValidator,
  validateRequest,
  licenseRenewalController.approveRenewal
);
router.put(
  '/:id/reject',
  authenticate,
  authorize('admin'),
  requirePermission('super_admin', 'moderator'),
  licenseRenewalController.rejectRenewal
);
router.put(
  '/:id/request-documents',
  authenticate,
  authorize('admin'),
  requirePermission('super_admin', 'moderator'),
  licenseRenewalController.requestMoreDocuments
);

module.exports = router;
