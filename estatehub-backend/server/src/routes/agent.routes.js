// src/routes/agent.routes.js

const express = require('express');
const agentController = require('../controllers/agent.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validateRequest = require('../middleware/validateRequest');
const {
  updateAgentProfileValidator,
  createReviewValidator,
  listAgentsValidator,
} = require('../validators/agent.validator');

const router = express.Router();

router.get('/', listAgentsValidator, validateRequest, agentController.listAgents);

// NOTE: /me/* must be declared before /:id, otherwise Express would match
// "me" as a value for the :id param.
router.get('/me/listings', authenticate, authorize('agent'), agentController.getMyAgentListings);
router.put(
  '/me/profile',
  authenticate,
  authorize('agent'),
  updateAgentProfileValidator,
  validateRequest,
  agentController.updateMyAgentProfile
);

router.get('/:id', agentController.getAgentById);
router.post(
  '/:id/reviews',
  authenticate,
  createReviewValidator,
  validateRequest,
  agentController.createAgentReview
);

module.exports = router;
