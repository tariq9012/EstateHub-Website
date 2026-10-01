// src/controllers/agent.controller.js

const agentModel = require('../models/agent.model');
const agentProfileModel = require('../models/agentProfile.model');
const agentReviewModel = require('../models/agentReview.model');
const propertyModel = require('../models/property.model');
const asyncHandler = require('../utils/asyncHandler');
const { success, failure } = require('../utils/apiResponse');
const rules = require('../utils/agentPortalRules');

/**
 * GET /api/agents
 * Public — FindAnAgent search/filter.
 */
const listAgents = asyncHandler(async (req, res) => {
  const { specialty, minRating, verifiedOnly, keyword, city, page, limit } = req.query;
  const result = await agentModel.search({
    specialty,
    minRating,
    verifiedOnly: verifiedOnly === 'true',
    keyword,
    city,
    page,
    limit,
  });
  return success(res, result, 200);
});

/**
 * GET /api/agents/me/listings
 * Agent only — every property assigned to this agent (agent_id match,
 * regardless of who originally submitted the listing).
 */
const getMyAgentListings = asyncHandler(async (req, res) => {
  const agent = await agentModel.findByUserId(req.user.userId);
  if (!agent) return failure(res, 'Agent profile not found for this account', 404);

  const properties = await propertyModel.findByAgent(agent.agent_id);
  return success(res, { properties }, 200);
});

/**
 * PUT /api/agents/me/profile
 * Agent only — updates both agents (agency/specialty/experience) and
 * agent_profiles (bio/website/office) in one call.
 */
const updateMyAgentProfile = asyncHandler(async (req, res) => {
  const agent = await agentModel.findByUserId(req.user.userId);
  if (!agent) return failure(res, 'Agent profile not found for this account', 404);

  const { agencyName, specialty, yearsExperience, bio, companyWebsite, officeAddress, licenseExpiryDate } = req.body;

  // The license expiry is self-declared only until an admin verifies the agent; afterwards it can only
  // change through an approved renewal (otherwise a verified agent could just type a new date).
  if (licenseExpiryDate !== undefined && !rules.canEditLicenseExpiry(agent.verification_status)) {
    return failure(
      res,
      'Your license expiry date is verified and can only be changed through a license renewal.',
      403,
      { code: 'EXPIRY_LOCKED' }
    );
  }

  await agentModel.updateAgentFields(agent.agent_id, {
    agency_name: agencyName,
    specialty,
    years_experience: yearsExperience,
    license_expiry_date: licenseExpiryDate,
  });
  await agentProfileModel.upsert(agent.agent_id, {
    bio,
    company_website: companyWebsite,
    office_address: officeAddress,
  });

  const updated = await agentModel.findFullById(agent.agent_id);
  return success(res, { agent: updated }, 200);
});

/**
 * GET /api/agents/:id
 * Public agent profile + their reviews.
 */
const getAgentById = asyncHandler(async (req, res) => {
  const agentId = Number(req.params.id);
  if (!Number.isInteger(agentId)) return failure(res, 'Invalid agent id', 400);

  const agent = await agentModel.findFullById(agentId);
  if (!agent) return failure(res, 'Agent not found', 404);

  const reviews = await agentReviewModel.listForAgent(agentId);
  return success(res, { agent, reviews }, 200);
});

/**
 * POST /api/agents/:id/reviews
 * Auth required — one review per user per agent.
 */
const createAgentReview = asyncHandler(async (req, res) => {
  const agentId = Number(req.params.id);
  if (!Number.isInteger(agentId)) return failure(res, 'Invalid agent id', 400);

  const { rating, comment } = req.body;

  const agent = await agentModel.findFullById(agentId);
  if (!agent) return failure(res, 'Agent not found', 404);
  if (agent.user_id === req.user.userId) {
    return failure(res, 'You cannot review your own agent profile.', 403, { code: 'OWN_PROFILE' });
  }

  const created = await agentReviewModel.create({ agentId, userId: req.user.userId, rating, comment });
  if (!created) return failure(res, 'You have already reviewed this agent', 409);

  await agentReviewModel.recalculateAgentRating(agentId);
  const reviews = await agentReviewModel.listForAgent(agentId);
  return success(res, { reviews }, 201);
});

module.exports = { listAgents, getMyAgentListings, updateMyAgentProfile, getAgentById, createAgentReview };