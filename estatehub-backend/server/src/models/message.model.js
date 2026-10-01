// src/models/message.model.js

const { pool } = require('../config/db');

async function createMessage({ conversationId, senderId, messageText }) {
  const [result] = await pool.query(
    `INSERT INTO messages (conversation_id, sender_id, message_text)
     VALUES (:conversationId, :senderId, :messageText)`,
    { conversationId, senderId, messageText }
  );
  await pool.query('UPDATE conversations SET last_message_at = NOW() WHERE conversation_id = :conversationId', {
    conversationId,
  });
  return result.insertId;
}

async function listForConversation(conversationId) {
  const [rows] = await pool.query(
    `SELECT m.*, u.first_name, u.last_name
     FROM messages m JOIN users u ON u.user_id = m.sender_id
     WHERE m.conversation_id = :conversationId
     ORDER BY m.created_at ASC`,
    { conversationId }
  );
  return rows;
}

/** Marks every message NOT sent by this user as read (called when they open the thread). */
async function markConversationRead(conversationId, userId) {
  await pool.query(
    `UPDATE messages SET is_read = TRUE
     WHERE conversation_id = :conversationId AND sender_id != :userId AND is_read = FALSE`,
    { conversationId, userId }
  );
}

module.exports = { createMessage, listForConversation, markConversationRead };
