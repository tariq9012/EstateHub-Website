// src/controllers/comparison.controller.js

const comparisonModel = require('../models/comparison.model');
const propertyModel = require('../models/property.model');
const asyncHandler = require('../utils/asyncHandler');
const { success, failure } = require('../utils/apiResponse');

const MAX_COMPARISON_ITEMS = 4;

async function getOrCreateComparison(userId) {
  let comparison = await comparisonModel.findLatestForUser(userId);
  if (!comparison) {
    const comparisonId = await comparisonModel.createComparison(userId);
    comparison = await comparisonModel.findById(comparisonId);
  }
  return comparison;
}

const getComparison = asyncHandler(async (req, res) => {
  const comparison = await getOrCreateComparison(req.user.userId);
  const properties = await comparisonModel.listItems(comparison.comparison_id);
  return success(res, { comparisonId: comparison.comparison_id, properties }, 200);
});

const addToComparison = asyncHandler(async (req, res) => {
  const propertyId = Number(req.params.propertyId);
  if (!Number.isInteger(propertyId)) return failure(res, 'Invalid property id', 400);

  const property = await propertyModel.findOwnerInfo(propertyId);
  if (!property) return failure(res, 'Property not found', 404);

  const comparison = await getOrCreateComparison(req.user.userId);

  const existingItems = await comparisonModel.listItems(comparison.comparison_id);
  const alreadyIn = existingItems.some((p) => p.property_id === propertyId);
  if (!alreadyIn && existingItems.length >= MAX_COMPARISON_ITEMS) {
    return failure(res, `You can compare up to ${MAX_COMPARISON_ITEMS} properties at a time`, 400);
  }

  const added = await comparisonModel.addItem(comparison.comparison_id, propertyId);
  const properties = await comparisonModel.listItems(comparison.comparison_id);
  return success(res, { comparisonId: comparison.comparison_id, properties }, added ? 201 : 200);
});

const removeFromComparison = asyncHandler(async (req, res) => {
  const propertyId = Number(req.params.propertyId);
  if (!Number.isInteger(propertyId)) return failure(res, 'Invalid property id', 400);

  const comparison = await getOrCreateComparison(req.user.userId);
  await comparisonModel.removeItem(comparison.comparison_id, propertyId);
  const properties = await comparisonModel.listItems(comparison.comparison_id);
  return success(res, { comparisonId: comparison.comparison_id, properties }, 200);
});

module.exports = { getComparison, addToComparison, removeFromComparison };
