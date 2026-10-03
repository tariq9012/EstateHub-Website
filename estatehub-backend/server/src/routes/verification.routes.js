// src/routes/verification.routes.js

const express = require('express');
const verificationController = require('../controllers/verification.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const requirePermission = require('../middleware/requirePermission');
const validateRequest = require('../middleware/validateRequest');
const { documentUpload } = require('../middleware/upload');
const { finalizeDirectUploads } = require('../middleware/directUpload');
const directUpload = require('../controllers/directUpload.controller');
const { rejectDocumentValidator } = require('../validators/verification.validator');

const router = express.Router();

// --- Agent ---
router.post(
  '/documents',
  authenticate,
  authorize('agent'),
  ...documentUpload,
  verificationController.uploadMyDocument
);
// Browser-direct (Cloudflare R2) variant — STORAGE_DRIVER=r2 only. The agent id always comes from the JWT.
router.post(
  '/documents/direct/presign',
  authenticate,
  authorize('agent'),
  directUpload.requireDirectMode,
  directUpload.presignVerificationDocument
);
router.post(
  '/documents/direct/complete',
  authenticate,
  authorize('agent'),
  directUpload.requireDirectMode,
  finalizeDirectUploads('verification-document', directUpload.resolveAgentOwner),
  verificationController.uploadMyDocument
);
router.get('/me', authenticate, authorize('agent'), verificationController.getMyVerificationStatus);
// Agent submits their own verification for admin review (unverified/rejected -> pending).
router.post('/submit', authenticate, authorize('agent'), verificationController.submitMyVerification);
// Agent removes one of their OWN initial-verification documents (e.g. to replace a rejected one).
router.delete('/documents/:documentId', authenticate, authorize('agent'), verificationController.deleteMyDocument);

// Document bytes: the owning agent OR any admin (read-only access, so every permission level).
// NOTE: declared before the admin /:agentId section for the same routing-order reason as below.
router.get(
  '/documents/:documentId/file',
  authenticate,
  authorize('admin', 'agent'),
  verificationController.getDocumentFile
);

// --- Admin --- (super_admin + moderator for decisions; support is read-only, see requirePermission.js)
// NOTE: /queue and /documents/* must be declared before /:agentId.
router.get('/queue', authenticate, authorize('admin'), verificationController.listVerificationQueue);
router.put(
  '/documents/:documentId/verify',
  authenticate,
  authorize('admin'),
  requirePermission('super_admin', 'moderator'),
  verificationController.verifyDocument
);
router.put(
  '/documents/:documentId/reject',
  authenticate,
  authorize('admin'),
  requirePermission('super_admin', 'moderator'),
  rejectDocumentValidator,
  validateRequest,
  verificationController.rejectDocument
);
router.get('/:agentId', authenticate, authorize('admin'), verificationController.getAgentVerificationDetail);
router.put(
  '/:agentId/verify',
  authenticate,
  authorize('admin'),
  requirePermission('super_admin', 'moderator'),
  verificationController.verifyAgent
);
router.put(
  '/:agentId/reject',
  authenticate,
  authorize('admin'),
  requirePermission('super_admin', 'moderator'),
  verificationController.rejectAgent
);

module.exports = router;
