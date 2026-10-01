// src/controllers/inquiry.controller.js

const propertyModel = require('../models/property.model');
const agentModel = require('../models/agent.model');
const inquiryModel = require('../models/inquiry.model');
const conversationModel = require('../models/conversation.model');
const messageModel = require('../models/message.model');
const notificationModel = require('../models/notification.model');
const asyncHandler = require('../utils/asyncHandler');
const { success, failure } = require('../utils/apiResponse');

/**
 * POST /api/inquiries
 * Auth required. Creates the inquiry row, finds/creates the buyer<->agent
 * conversation for that property, and posts the inquiry message as the
 * first message in it — one submission drives all three subsystems.
 */
const createInquiry = asyncHandler(async (req, res) => {
  const { propertyId, message, preferredVisitDate } = req.body;

  const property = await propertyModel.findOwnerInfo(propertyId);
  if (!property) return failure(res, 'Property not found', 404);

  let agentId = null;
  let recipientUserId = property.listed_by_user_id;

  if (property.agent_id) {
    const agent = await agentModel.findFullById(property.agent_id);
    if (agent) {
      agentId = agent.agent_id;
      recipientUserId = agent.user_id;
    }
  }

  const inquiryId = await inquiryModel.create({
    propertyId,
    userId: req.user.userId,
    agentId,
    message,
    preferredVisitDate,
  });

  const conversation = await conversationModel.findOrCreate({
    buyerId: req.user.userId,
    agentUserId: recipientUserId,
    propertyId,
    inquiryId,
  });

  await messageModel.createMessage({
    conversationId: conversation.conversation_id,
    senderId: req.user.userId,
    messageText: message,
  });

  await notificationModel.create({
    userId: recipientUserId,
    type: 'inquiry',
    title: 'New inquiry received',
    body: message,
    relatedEntityType: 'inquiry',
    relatedEntityId: inquiryId,
  });

  const inquiry = await inquiryModel.findById(inquiryId);
  return success(res, { inquiry, conversationId: conversation.conversation_id }, 201);
});

/**
 * GET /api/inquiries/me
 */
const getMyInquiries = asyncHandler(async (req, res) => {
  const inquiries = await inquiryModel.listForUser(req.user.userId);
  return success(res, { inquiries }, 200);
});

/**
 * GET /api/inquiries/received
 * Agent only.
 */
const getReceivedInquiries = asyncHandler(async (req, res) => {
  const agent = await agentModel.findByUserId(req.user.userId);
  if (!agent) return failure(res, 'Agent profile not found for this account', 404);

  const inquiries = await inquiryModel.listReceivedByAgent(agent.agent_id);
  return success(res, { inquiries }, 200);
});

/**
 * PUT /api/inquiries/:id/status
 * The receiving agent or an admin only.
 */
const updateInquiryStatus = asyncHandler(async (req, res) => {
  const inquiryId = Number(req.params.id);
  const { status } = req.body;

  const inquiry = await inquiryModel.findById(inquiryId);
  if (!inquiry) return failure(res, 'Inquiry not found', 404);

  const agent = await agentModel.findByUserId(req.user.userId);
  const isRecipientAgent = agent && inquiry.agent_id === agent.agent_id;

  if (req.user.role !== 'admin' && !isRecipientAgent) {
    return failure(res, 'You do not have permission to update this inquiry', 403);
  }

  await inquiryModel.updateStatus(inquiryId, status);
  const updated = await inquiryModel.findById(inquiryId);
  return success(res, { inquiry: updated }, 200);
});

module.exports = { createInquiry, getMyInquiries, getReceivedInquiries, updateInquiryStatus };
