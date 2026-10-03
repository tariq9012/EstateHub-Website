// src/routes/index.js
// Every feature router gets mounted here, and this whole thing is mounted
// once at /api in app.js. Keeps app.js clean as the route list grows
// through Phases 4-9.

const express = require('express');
const healthRoutes = require('./health.routes');

const router = express.Router();

router.use(healthRoutes);
router.get('/uploads/mode', require('../controllers/directUpload.controller').getUploadMode);
router.use('/auth', require('./auth.routes'));
router.use('/properties', require('./property.routes'));
router.use('/lookups', require('./lookup.routes'));
router.use('/users', require('./user.routes'));
router.use('/favorites', require('./favorite.routes'));
router.use('/recently-viewed', require('./recentlyViewed.routes'));
router.use('/comparisons', require('./comparison.routes'));
router.use('/notifications', require('./notification.routes'));
router.use('/agents', require('./agent.routes'));
router.use('/verification', require('./verification.routes'));
router.use('/license-renewals', require('./licenseRenewal.routes'));
router.use('/inquiries', require('./inquiry.routes'));
router.use('/conversations', require('./conversation.routes'));
router.use('/appointments', require('./appointment.routes'));
router.use('/admin', require('./admin.routes'));

module.exports = router;
