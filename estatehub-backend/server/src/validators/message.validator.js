// src/validators/message.validator.js

const { body } = require('express-validator');

const sendMessageValidator = [
  body('messageText').trim().notEmpty().withMessage('Message text is required').isLength({ max: 5000 }),
];

module.exports = { sendMessageValidator };
