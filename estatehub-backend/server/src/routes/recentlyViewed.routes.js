// src/routes/recentlyViewed.routes.js

const express = require('express');
const recentlyViewedController = require('../controllers/recentlyViewed.controller');
const authenticate = require('../middleware/authenticate');

const router = express.Router();

router.get('/', authenticate, recentlyViewedController.listRecentlyViewed);

module.exports = router;
