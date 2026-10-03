// src/routes/property.routes.js

const express = require('express');
const propertyController = require('../controllers/property.controller');
const authenticate = require('../middleware/authenticate');
const optionalAuthenticate = require('../middleware/optionalAuthenticate');
const authorize = require('../middleware/authorize');
const requirePermission = require('../middleware/requirePermission');
const validateRequest = require('../middleware/validateRequest');
const { propertyImageUpload } = require('../middleware/upload');
const { finalizeDirectUploads } = require('../middleware/directUpload');
const directUpload = require('../controllers/directUpload.controller');
const {
  createPropertyValidator,
  updatePropertyValidator,
  listPropertiesValidator,
  rejectPropertyValidator,
  setAmenitiesValidator,
  createPropertyReviewValidator,
} = require('../validators/property.validator');

const router = express.Router();

// --- Public browsing ---
router.get('/', listPropertiesValidator, validateRequest, propertyController.listProperties);

// NOTE: /mine must be declared before /:id, otherwise Express would match
// "mine" as a value for the :id param.
router.get('/mine', authenticate, propertyController.listMyProperties);

router.get('/:id', optionalAuthenticate, propertyController.getPropertyById);

// --- Create / update / archive ---
// Only agents and admins may create listings; buyers get 403 (they have no agent profile and the
// product's listing flow is agent-led). New listings still start as 'pending_review'.
router.post(
  '/',
  authenticate,
  authorize('agent', 'admin'),
  createPropertyValidator,
  validateRequest,
  propertyController.createProperty
);
router.put('/:id', authenticate, updatePropertyValidator, validateRequest, propertyController.updateProperty);
router.delete('/:id', authenticate, propertyController.archiveProperty);

// --- Images ---
// Ownership is checked BEFORE the upload middleware runs, so a non-owner can never write files to disk.
router.post(
  '/:id/images',
  authenticate,
  propertyController.requirePropertyModifier,
  ...propertyImageUpload,
  propertyController.addPropertyImages
);
// Browser-direct (Cloudflare R2) variant — STORAGE_DRIVER=r2 only. Same ownership gate first; "complete" then
// validates the uploaded bytes server-side and hands off to the SAME controller (caps + review-status rules).
router.post(
  '/:id/images/direct/presign',
  authenticate,
  directUpload.requireDirectMode,
  propertyController.requirePropertyModifier,
  directUpload.presignPropertyImages
);
router.post(
  '/:id/images/direct/complete',
  authenticate,
  directUpload.requireDirectMode,
  propertyController.requirePropertyModifier,
  finalizeDirectUploads('property-image', directUpload.resolvePropertyOwner),
  propertyController.addPropertyImages
);
router.delete(
  '/:id/images/:imageId',
  authenticate,
  propertyController.requirePropertyModifier,
  propertyController.deletePropertyImage
);
router.put(
  '/:id/images/:imageId/primary',
  authenticate,
  propertyController.requirePropertyModifier,
  propertyController.setPrimaryImage
);

// --- Amenities ---
router.put(
  '/:id/amenities',
  authenticate,
  // Ownership is checked at the route (owner / assigned agent / admin) before validation or any write,
  // matching the image routes. The controller re-checks as defense in depth.
  propertyController.requirePropertyModifier,
  setAmenitiesValidator,
  validateRequest,
  propertyController.setPropertyAmenities
);

// --- Reviews ---
// NOTE: '/reviews/:reviewId' (2 segments) never collides with '/:id' (1 segment).
router.get('/:id/reviews', propertyController.listPropertyReviews);
router.post(
  '/:id/reviews',
  authenticate,
  createPropertyReviewValidator,
  validateRequest,
  propertyController.createPropertyReview
);
router.put(
  '/reviews/:reviewId',
  authenticate,
  createPropertyReviewValidator,
  validateRequest,
  propertyController.updatePropertyReview
);
router.delete('/reviews/:reviewId', authenticate, propertyController.deletePropertyReview);

// --- Admin moderation --- (super_admin + moderator; support is read-only, see requirePermission.js)
router.put(
  '/:id/approve',
  authenticate,
  authorize('admin'),
  requirePermission('super_admin', 'moderator'),
  propertyController.approveProperty
);
router.put(
  '/:id/reject',
  authenticate,
  authorize('admin'),
  requirePermission('super_admin', 'moderator'),
  rejectPropertyValidator,
  validateRequest,
  propertyController.rejectProperty
);

module.exports = router;