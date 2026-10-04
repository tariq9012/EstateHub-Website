// src/controllers/property.controller.js

const { pool } = require('../config/db');
const propertyModel = require('../models/property.model');
const propertyImageModel = require('../models/propertyImage.model');
const propertyAmenityModel = require('../models/propertyAmenity.model');
const locationModel = require('../models/location.model');
const agentModel = require('../models/agent.model');
const adminUserModel = require('../models/adminUser.model');
const adminActionLogModel = require('../models/adminActionLog.model');
const recentlyViewedModel = require('../models/recentlyViewed.model');
const notificationModel = require('../models/notification.model');
const propertyReviewModel = require('../models/propertyReview.model');

const asyncHandler = require('../utils/asyncHandler');
const propertyRules = require('../utils/propertyRules');
const storage = require('../services/storage');
const { success, failure } = require('../utils/apiResponse');

/** True if the requesting user is allowed to modify this property. */
async function userCanModify(user, property) {
  if (user.role === 'admin') return true;
  if (property.listed_by_user_id === user.userId) return true;
  if (user.role === 'agent') {
    const agent = await agentModel.findByUserId(user.userId);
    if (agent && property.agent_id === agent.agent_id) return true;
  }
  return false;
}

/**
 * Route middleware: resolves :id and verifies the caller may modify that property (owner, assigned
 * agent — derived from the JWT — or admin). Run it BEFORE multer so a non-owner's upload is rejected
 * before a single byte is written to disk. Sets req.property.
 */
const requirePropertyModifier = asyncHandler(async (req, res, next) => {
  const propertyId = Number(req.params.id);
  if (!Number.isInteger(propertyId) || propertyId < 1) return failure(res, 'Invalid property id', 400);
  const existing = await propertyModel.findOwnerInfo(propertyId);
  if (!existing) return failure(res, 'Property not found', 404);
  const allowed = await userCanModify(req.user, existing);
  if (!allowed) return failure(res, 'You do not have permission to modify this property', 403);
  req.property = existing;
  return next();
});

// Statuses the PUBLIC browse endpoint is allowed to show. 'draft', 'pending_review',
// 'rejected' and 'archived' must never be reachable here regardless of what a caller
// requests — this whitelist is the enforcement point for that.
const PUBLIC_STATUSES = ['active', 'under_contract', 'sold'];

/**
 * GET /api/properties
 * Public — always scoped to a whitelisted subset of statuses (never draft/pending/rejected/
 * archived). Callers may request `status=active,under_contract` (comma-separated) to include
 * Under Contract / Recently Sold listings alongside active ones; anything not in
 * PUBLIC_STATUSES is silently dropped, and an empty/invalid result falls back to 'active'.
 */
const listProperties = asyncHandler(async (req, res) => {
  const {
    page,
    limit,
    typeId,
    listingType,
    minPrice,
    maxPrice,
    minBedrooms,
    minBathrooms,
    minYearBuilt,
    maxYearBuilt,
    city,
    agentId,
    sortBy,
    amenities,
    keyword,
    status,
  } = req.query;

  const amenityIds = amenities
    ? amenities
        .split(',')
        .map((id) => parseInt(id, 10))
        .filter((id) => !Number.isNaN(id))
    : undefined;

  const requestedStatuses = status
    ? status.split(',').map((s) => s.trim()).filter((s) => PUBLIC_STATUSES.includes(s))
    : [];

  const result = await propertyModel.search({
    status: requestedStatuses.length > 0 ? requestedStatuses : 'active',
    typeId,
    agentId,
    listingType,
    minPrice,
    maxPrice,
    minBedrooms,
    minBathrooms,
    minYearBuilt,
    maxYearBuilt,
    city,
    amenityIds,
    keyword,
    page,
    limit,
    sortBy,
  });

  return success(res, result, 200);
});

/**
 * GET /api/properties/mine
 * Auth required — every listing owned by the caller, any status.
 */
const listMyProperties = asyncHandler(async (req, res) => {
  const properties = await propertyModel.findByOwner(req.user.userId);
  return success(res, { properties }, 200);
});

/**
 * GET /api/properties/:id
 * Public for active listings. Non-active listings are only visible to
 * their owner/agent or an admin (optionalAuthenticate populates req.user
 * when a valid token is present, without blocking anonymous requests).
 */
const getPropertyById = asyncHandler(async (req, res) => {
  const propertyId = Number(req.params.id);
  if (!Number.isInteger(propertyId)) return failure(res, 'Invalid property id', 400);

  const property = await propertyModel.findById(propertyId);
  if (!property) return failure(res, 'Property not found', 404);

  const isPubliclyVisible = property.status === 'active';
  const isPrivileged = req.user && (await userCanModify(req.user, property));

  if (!isPubliclyVisible && !isPrivileged) {
    return failure(res, 'Property not found', 404);
  }

  if (isPubliclyVisible) {
    await propertyModel.incrementViewCount(propertyId);
    if (req.user) {
      // Best-effort — a logging failure here should never break the page view.
      recentlyViewedModel.recordView(req.user.userId, propertyId).catch(() => {});
    }
  }

  return success(res, { property }, 200);
});

/**
 * POST /api/properties
 * Auth required (buyer, agent, or admin). New listings always start as
 * 'pending_review' — they only become publicly visible after admin approval.
 */
const createProperty = asyncHandler(async (req, res) => {
  const {
    typeId,
    title,
    description,
    price,
    listingType,
    bedrooms,
    bathrooms,
    areaSqft,
    lotSizeSqft,
    yearBuilt,
    addressLine,
    postalCode,
    latitude,
    longitude,
    neighborhood,
    city,
    state,
    country,
    saveAsDraft,
  } = req.body;

  let agentId = null;
  if (req.user.role === 'agent') {
    const agent = await agentModel.findByUserId(req.user.userId);
    agentId = agent ? agent.agent_id : null;
  }

  // Location lookup/creation and the property insert commit together or not at all (one client, always released).
  const propertyId = await pool.withTransaction(async (tx) => {
    const locationId = await locationModel.findOrCreate(tx, { neighborhood, city, state, country });

    return propertyModel.createProperty(tx, {
      listedByUserId: req.user.userId,
      agentId,
      typeId,
      locationId,
      title,
      description,
      addressLine,
      postalCode,
      latitude,
      longitude,
      price,
      listingType,
      bedrooms,
      bathrooms,
      areaSqft,
      lotSizeSqft,
      yearBuilt,
      status: saveAsDraft ? 'draft' : 'pending_review',
    });
  });

  const property = await propertyModel.findById(propertyId);
  return success(res, { property }, 201);
});

/**
 * PUT /api/properties/:id
 * Owner (who listed it), assigned agent (from the JWT), or admin only.
 *
 * Moderation (see utils/propertyRules.js): editing a LIVE listing sends it back to 'pending_review'
 * so an admin re-approves the changes; a draft/rejected listing enters review only when
 * `submitForReview: true` is sent; sold/archived/under-contract listings are not editable by the owner.
 */
const updateProperty = asyncHandler(async (req, res) => {
  const propertyId = Number(req.params.id);
  const existing = await propertyModel.findOwnerInfo(propertyId);
  if (!existing) return failure(res, 'Property not found', 404);
  const allowed = await userCanModify(req.user, existing);
  if (!allowed) return failure(res, 'You do not have permission to modify this property', 403);

  if (!propertyRules.canEditStatus(req.user.role, existing.status)) {
    return failure(res, propertyRules.notEditableMessage(existing.status), 409, { code: 'PROPERTY_NOT_EDITABLE' });
  }

  const body = req.body;
  const fieldMap = {
    title: 'title',
    description: 'description',
    addressLine: 'address_line',
    postalCode: 'postal_code',
    latitude: 'latitude',
    longitude: 'longitude',
    price: 'price',
    listingType: 'listing_type',
    bedrooms: 'bedrooms',
    bathrooms: 'bathrooms',
    areaSqft: 'area_sqft',
    lotSizeSqft: 'lot_size_sqft',
    yearBuilt: 'year_built',
    typeId: 'type_id',
  };

  const updates = {};
  Object.entries(fieldMap).forEach(([camel, snake]) => {
    if (body[camel] !== undefined) updates[snake] = body[camel];
  });

  if (body.city || body.neighborhood || body.state || body.country) {
    const locationId = await locationModel.findOrCreate(pool, {
      neighborhood: body.neighborhood,
      city: body.city,
      state: body.state,
      country: body.country,
    });
    updates.location_id = locationId;
  }

  const submitForReview = body.submitForReview === true || body.submitForReview === 'true';
  const nextStatus = propertyRules.statusAfterEdit({ role: req.user.role, status: existing.status, submitForReview });
  const statusChanges = nextStatus !== existing.status;

  if (Object.keys(updates).length === 0 && !statusChanges) {
    return failure(res, 'No valid fields provided to update', 400);
  }

  // Change the status FIRST: if the content update then fails, the listing is merely pending
  // (safe) — never live with content nobody reviewed.
  if (statusChanges) {
    const moved = await propertyModel.transitionStatus(propertyId, existing.status, nextStatus, { clearRejection: true });
    if (!moved) {
      return failure(res, 'This listing was just changed by someone else. Please reload and try again.', 409, {
        code: 'PROPERTY_CHANGED',
      });
    }
  }
  if (Object.keys(updates).length > 0) await propertyModel.updateProperty(propertyId, updates);

  const property = await propertyModel.findById(propertyId);
  return success(res, { property, statusChanged: statusChanges, previousStatus: existing.status }, 200);
});

/**
 * DELETE /api/properties/:id
 * Soft-delete: sets status='archived' rather than a hard SQL DELETE, since
 * a hard delete would cascade-remove images/favorites/reviews history tied
 * to the listing. Owner, assigned agent, or admin only.
 */
const archiveProperty = asyncHandler(async (req, res) => {
  const propertyId = Number(req.params.id);
  const existing = await propertyModel.findOwnerInfo(propertyId);
  if (!existing) return failure(res, 'Property not found', 404);

  const allowed = await userCanModify(req.user, existing);
  if (!allowed) return failure(res, 'You do not have permission to modify this property', 403);

  await propertyModel.archiveProperty(propertyId);
  return success(res, { message: 'Property archived' }, 200);
});

/**
 * POST /api/properties/:id/images
 * multipart/form-data, field name "images" (up to 20 files per request, MAX_IMAGES_PER_PROPERTY total).
 * Route order: authenticate -> requirePropertyModifier -> upload guards, so ownership is verified before
 * anything is written, and files of a rejected request are deleted.
 * Adding photos to a LIVE listing sends it back to review (public content changed).
 */
const addPropertyImages = asyncHandler(async (req, res) => {
  const propertyId = Number(req.params.id);
  const existing = req.property || (await propertyModel.findOwnerInfo(propertyId));
  if (!existing) return failure(res, 'Property not found', 404);
  if (!req.property) {
    const allowed = await userCanModify(req.user, existing);
    if (!allowed) return failure(res, 'You do not have permission to modify this property', 403);
  }
  if (!propertyRules.canEditStatus(req.user.role, existing.status)) {
    return failure(res, propertyRules.notEditableMessage(existing.status), 409, { code: 'PROPERTY_NOT_EDITABLE' });
  }
  if (!req.files || req.files.length === 0) {
    return failure(res, 'No image files were uploaded', 400);
  }

  const currentCount = await propertyImageModel.countByProperty(propertyId);
  if (currentCount + req.files.length > propertyRules.MAX_IMAGES_PER_PROPERTY) {
    return failure(res, `A listing can have at most ${propertyRules.MAX_IMAGES_PER_PROPERTY} photos.`, 400, { code: 'TOO_MANY_IMAGES' });
  }

  const images = req.files.map((file) => ({
    // Direct (R2) uploads carry the stored public URL; legacy multipart uploads keep the local path.
    imageUrl: file.storedRef || `/uploads/properties/${file.filename}`,
    altText: null,
  }));
  await propertyImageModel.addImages(propertyId, images);

  const nextStatus = propertyRules.statusAfterImageAdd({ role: req.user.role, status: existing.status });
  const statusChanged = nextStatus !== existing.status;
  if (statusChanged) await propertyModel.transitionStatus(propertyId, existing.status, nextStatus);

  const allImages = await propertyImageModel.listByProperty(propertyId);
  return success(res, { images: allImages, statusChanged }, 201);
});

/**
 * DELETE /api/properties/:id/images/:imageId
 * Removes the row AND the file, and promotes another image if the primary was deleted.
 */
const deletePropertyImage = asyncHandler(async (req, res) => {
  const propertyId = Number(req.params.id);
  const imageId = Number(req.params.imageId);
  const existing = req.property || (await propertyModel.findOwnerInfo(propertyId));
  if (!existing) return failure(res, 'Property not found', 404);
  if (!req.property) {
    const allowed = await userCanModify(req.user, existing);
    if (!allowed) return failure(res, 'You do not have permission to modify this property', 403);
  }
  if (!Number.isInteger(imageId) || imageId < 1) return failure(res, 'Invalid image id', 400);

  const deleted = await propertyImageModel.deleteImage(imageId, propertyId);
  if (!deleted) return failure(res, 'Image not found', 404);

  await storage.deleteByReference(deleted.image_url);
  if (deleted.is_primary) await propertyImageModel.ensurePrimary(propertyId);

  const images = await propertyImageModel.listByProperty(propertyId);
  return success(res, { message: 'Image deleted', images }, 200);
});

/**
 * PUT /api/properties/:id/images/:imageId/primary
 */
const setPrimaryImage = asyncHandler(async (req, res) => {
  const propertyId = Number(req.params.id);
  const imageId = Number(req.params.imageId);
  if (!Number.isInteger(imageId) || imageId < 1) return failure(res, 'Invalid image id', 400);
  const ok = await propertyImageModel.setPrimary(imageId, propertyId);
  if (!ok) return failure(res, 'Image not found', 404);
  const images = await propertyImageModel.listByProperty(propertyId);
  return success(res, { images }, 200);
});

/**
 * PUT /api/properties/:id/amenities
 * Body: { amenityIds: number[] } — replaces the full set.
 */
const setPropertyAmenities = asyncHandler(async (req, res) => {
  const propertyId = Number(req.params.id);
  const { amenityIds } = req.body;

  const existing = await propertyModel.findOwnerInfo(propertyId);
  if (!existing) return failure(res, 'Property not found', 404);

  const allowed = await userCanModify(req.user, existing);
  if (!allowed) return failure(res, 'You do not have permission to modify this property', 403);

  await propertyAmenityModel.setForProperty(propertyId, amenityIds);
  const amenities = await propertyAmenityModel.listForProperty(propertyId);
  return success(res, { amenities }, 200);
});

/**
 * PUT /api/properties/:id/approve
 * Admin only.
 */
const approveProperty = asyncHandler(async (req, res) => {
  const propertyId = Number(req.params.id);
  const existing = await propertyModel.findOwnerInfo(propertyId);
  if (!existing) return failure(res, 'Property not found', 404);

  const admin = await adminUserModel.findByUserId(req.user.userId);
  if (!admin) return failure(res, 'Admin profile not found for this account', 403);

  const applied = await propertyModel.approveProperty(propertyId, admin.admin_id);
  if (!applied) {
    return failure(res, 'This listing is not pending review (it may already have been approved, rejected, or changed).', 409, {
      code: 'INVALID_TRANSITION',
    });
  }
  await adminActionLogModel.logAction({
    adminId: admin.admin_id,
    actionType: 'property_approved',
    targetType: 'property',
    targetId: propertyId,
  });
  await notificationModel.create({
    userId: existing.listed_by_user_id,
    type: 'property_approved',
    title: 'Your property was approved',
    body: 'Your listing is now live and visible to buyers.',
    relatedEntityType: 'property',
    relatedEntityId: propertyId,
  });

  const property = await propertyModel.findById(propertyId);
  return success(res, { property }, 200);
});

/**
 * PUT /api/properties/:id/reject
 * Admin only. Body: { reason: string }
 */
const rejectProperty = asyncHandler(async (req, res) => {
  const propertyId = Number(req.params.id);
  const { reason } = req.body;

  const existing = await propertyModel.findOwnerInfo(propertyId);
  if (!existing) return failure(res, 'Property not found', 404);

  const admin = await adminUserModel.findByUserId(req.user.userId);
  if (!admin) return failure(res, 'Admin profile not found for this account', 403);

  const applied = await propertyModel.rejectProperty(propertyId, admin.admin_id, reason);
  if (!applied) {
    return failure(res, 'This listing is not pending review (it may already have been approved, rejected, or changed).', 409, {
      code: 'INVALID_TRANSITION',
    });
  }
  await adminActionLogModel.logAction({
    adminId: admin.admin_id,
    actionType: 'property_rejected',
    targetType: 'property',
    targetId: propertyId,
    notes: reason,
  });
  await notificationModel.create({
    userId: existing.listed_by_user_id,
    type: 'property_rejected',
    title: 'Your property listing was rejected',
    body: reason,
    relatedEntityType: 'property',
    relatedEntityId: propertyId,
  });

  const property = await propertyModel.findById(propertyId);
  return success(res, { property }, 200);
});

/**
 * GET /api/properties/:id/reviews
 * Public.
 */
const listPropertyReviews = asyncHandler(async (req, res) => {
  const propertyId = Number(req.params.id);
  if (!Number.isInteger(propertyId)) return failure(res, 'Invalid property id', 400);

  const reviews = await propertyReviewModel.listForProperty(propertyId);
  return success(res, { reviews }, 200);
});

/**
 * POST /api/properties/:id/reviews
 * Auth required — one review per user per property.
 */
const createPropertyReview = asyncHandler(async (req, res) => {
  const propertyId = Number(req.params.id);
  if (!Number.isInteger(propertyId)) return failure(res, 'Invalid property id', 400);

  const { rating, comment } = req.body;

  const property = await propertyModel.findOwnerInfo(propertyId);
  if (!property) return failure(res, 'Property not found', 404);

  const created = await propertyReviewModel.create({ propertyId, userId: req.user.userId, rating, comment });
  if (!created) return failure(res, 'You have already reviewed this property', 409);

  const reviews = await propertyReviewModel.listForProperty(propertyId);
  return success(res, { reviews }, 201);
});

/**
 * PUT /api/properties/reviews/:reviewId
 * Auth required — only the reviewer may edit their own review.
 */
const updatePropertyReview = asyncHandler(async (req, res) => {
  const reviewId = Number(req.params.reviewId);
  const { rating, comment } = req.body;

  const review = await propertyReviewModel.findById(reviewId);
  if (!review) return failure(res, 'Review not found', 404);
  if (review.user_id !== req.user.userId) {
    return failure(res, 'You can only edit your own review', 403);
  }

  await propertyReviewModel.update(reviewId, { rating, comment });
  const reviews = await propertyReviewModel.listForProperty(review.property_id);
  return success(res, { reviews }, 200);
});

/**
 * DELETE /api/properties/reviews/:reviewId
 * Auth required — the reviewer or an admin.
 */
const deletePropertyReview = asyncHandler(async (req, res) => {
  const reviewId = Number(req.params.reviewId);

  const review = await propertyReviewModel.findById(reviewId);
  if (!review) return failure(res, 'Review not found', 404);
  if (review.user_id !== req.user.userId && req.user.role !== 'admin') {
    return failure(res, 'You can only delete your own review', 403);
  }

  await propertyReviewModel.remove(reviewId);
  return success(res, { message: 'Review deleted' }, 200);
});

module.exports = {
  requirePropertyModifier,
  setPrimaryImage,
  listProperties,
  listMyProperties,
  getPropertyById,
  createProperty,
  updateProperty,
  archiveProperty,
  addPropertyImages,
  deletePropertyImage,
  setPropertyAmenities,
  approveProperty,
  rejectProperty,
  listPropertyReviews,
  createPropertyReview,
  updatePropertyReview,
  deletePropertyReview,
};