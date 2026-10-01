// src/controllers/lookup.controller.js

const propertyTypeModel = require('../models/propertyType.model');
const amenityModel = require('../models/amenity.model');
const locationModel = require('../models/location.model');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/apiResponse');

const getPropertyTypes = asyncHandler(async (req, res) => {
  const propertyTypes = await propertyTypeModel.listAll();
  return success(res, { propertyTypes }, 200);
});

const getAmenities = asyncHandler(async (req, res) => {
  const amenities = await amenityModel.listAll();
  return success(res, { amenities }, 200);
});

const getLocations = asyncHandler(async (req, res) => {
  const locations = await locationModel.listAll();
  return success(res, { locations }, 200);
});

module.exports = { getPropertyTypes, getAmenities, getLocations };