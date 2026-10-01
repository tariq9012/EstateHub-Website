// src/controllers/recentlyViewed.controller.js

const recentlyViewedModel = require('../models/recentlyViewed.model');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/apiResponse');

const listRecentlyViewed = asyncHandler(async (req, res) => {
  const properties = await recentlyViewedModel.listForUser(req.user.userId, req.query.limit);
  return success(res, { properties }, 200);
});

module.exports = { listRecentlyViewed };
