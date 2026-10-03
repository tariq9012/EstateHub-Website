// src/routes/health.routes.js

const express = require('express');
const { getHealth, getReadiness } = require('../controllers/health.controller');

const router = express.Router();

router.get('/health', getHealth);
router.get('/health/ready', getReadiness);

module.exports = router;