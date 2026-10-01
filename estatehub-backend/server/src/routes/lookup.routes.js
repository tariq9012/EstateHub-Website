// src/routes/lookup.routes.js

const express = require('express');
const lookupController = require('../controllers/lookup.controller');

const router = express.Router();

router.get('/property-types', lookupController.getPropertyTypes);
router.get('/amenities', lookupController.getAmenities);
router.get('/locations', lookupController.getLocations);

module.exports = router;