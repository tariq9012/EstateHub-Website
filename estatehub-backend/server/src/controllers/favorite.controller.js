// src/controllers/favorite.controller.js

const favoriteModel = require('../models/favorite.model');
const propertyModel = require('../models/property.model');
const asyncHandler = require('../utils/asyncHandler');
const { success, failure } = require('../utils/apiResponse');

const listFavorites = asyncHandler(async (req, res) => {
  const favorites = await favoriteModel.listForUser(req.user.userId);
  return success(res, { favorites }, 200);
});

const addFavorite = asyncHandler(async (req, res) => {
  const propertyId = Number(req.params.propertyId);
  if (!Number.isInteger(propertyId)) return failure(res, 'Invalid property id', 400);

  const property = await propertyModel.findOwnerInfo(propertyId);
  if (!property) return failure(res, 'Property not found', 404);

  const added = await favoriteModel.add(req.user.userId, propertyId);
  return success(res, { message: added ? 'Added to favorites' : 'Already in favorites' }, added ? 201 : 200);
});

const removeFavorite = asyncHandler(async (req, res) => {
  const propertyId = Number(req.params.propertyId);
  if (!Number.isInteger(propertyId)) return failure(res, 'Invalid property id', 400);

  const removed = await favoriteModel.remove(req.user.userId, propertyId);
  if (!removed) return failure(res, 'Favorite not found', 404);

  return success(res, { message: 'Removed from favorites' }, 200);
});

module.exports = { listFavorites, addFavorite, removeFavorite };
