// src/routes/favorite.routes.js

const express = require('express');
const favoriteController = require('../controllers/favorite.controller');
const authenticate = require('../middleware/authenticate');

const router = express.Router();

router.get('/', authenticate, favoriteController.listFavorites);
router.post('/:propertyId', authenticate, favoriteController.addFavorite);
router.delete('/:propertyId', authenticate, favoriteController.removeFavorite);

module.exports = router;
