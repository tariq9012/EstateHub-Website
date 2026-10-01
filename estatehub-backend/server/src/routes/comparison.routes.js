// src/routes/comparison.routes.js

const express = require('express');
const comparisonController = require('../controllers/comparison.controller');
const authenticate = require('../middleware/authenticate');

const router = express.Router();

router.get('/', authenticate, comparisonController.getComparison);
router.post('/items/:propertyId', authenticate, comparisonController.addToComparison);
router.delete('/items/:propertyId', authenticate, comparisonController.removeFromComparison);

module.exports = router;
