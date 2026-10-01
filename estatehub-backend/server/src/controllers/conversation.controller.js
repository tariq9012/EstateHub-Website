// src/controllers/conversation.controller.js

const conversationModel = require('../models/conversation.model');
const messageModel = require('../models/message.model');
const notificationModel = require('../models/notification.model');
const asyncHandler = require('../utils/asyncHandler');
const { success, failure } = require('../utils/apiResponse');

/**
 * GET /api/conversations
 * Inbox — every thread this user is a participant in.
 */
const listMyConversations = asyncHandler(async (req, res) => {
  const conversations = await conversationModel.listForUser(req.user.userId);
  return success(res, { conversations }, 200);
});

/**
 * GET /api/conversations/:id/messages
 * Opening a thread also marks the other party's messages as read.
 */
const getConversationMessages = asyncHandler(async (req, res) => {
  const conversationId = Number(req.params.id);
  const conversation = await conversationModel.findById(conversationId);
  if (!conversation) return failure(res, 'Conversation not found', 404);

  if (!conversationModel.isParticipant(conversation, req.user.userId)) {
    return failure(res, 'You do not have access to this conversation', 403);
  }

  const messages = await messageModel.listForConversation(conversationId);
  await messageModel.markConversationRead(conversationId, req.user.userId);

  return success(res, { conversation, messages }, 200);
});

/**
 * POST /api/conversations/:id/messages
 */
const sendMessage = asyncHandler(async (req, res) => {
  const conversationId = Number(req.params.id);
  const { messageText } = req.body;

  const conversation = await conversationModel.findById(conversationId);
  if (!conversation) return failure(res, 'Conversation not found', 404);

  if (!conversationModel.isParticipant(conversation, req.user.userId)) {
    return failure(res, 'You do not have access to this conversation', 403);
  }

  await messageModel.createMessage({ conversationId, senderId: req.user.userId, messageText });

  const recipientId =
    conversation.buyer_id === req.user.userId ? conversation.agent_user_id : conversation.buyer_id;
  await notificationModel.create({
    userId: recipientId,
    type: 'message',
    title: 'New message',
    body: messageText,
    relatedEntityType: 'conversation',
    relatedEntityId: conversationId,
  });

  const messages = await messageModel.listForConversation(conversationId);
  return success(res, { messages }, 201);
});

module.exports = { listMyConversations, getConversationMessages, sendMessage };
