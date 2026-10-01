// src/routes/conversation.routes.js

const express = require('express');
const conversationController = require('../controllers/conversation.controller');
const authenticate = require('../middleware/authenticate');
const validateRequest = require('../middleware/validateRequest');
const { sendMessageValidator } = require('../validators/message.validator');

const router = express.Router();

router.get('/', authenticate, conversationController.listMyConversations);
router.get('/:id/messages', authenticate, conversationController.getConversationMessages);
router.post(
  '/:id/messages',
  authenticate,
  sendMessageValidator,
  validateRequest,
  conversationController.sendMessage
);

module.exports = router;
