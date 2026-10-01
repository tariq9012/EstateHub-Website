// src/models/conversation.model.js

const { pool } = require('../config/db');

/**
 * Finds the existing buyer<->agent conversation for a property, or creates
 * one — atomically, via UNIQUE(buyer_id, agent_user_id, property_id) +
 * ON DUPLICATE KEY, same safe pattern as location.model.js's findOrCreate.
 */
async function findOrCreate({ buyerId, agentUserId, propertyId, inquiryId }) {
  const [result] = await pool.query(
    `INSERT INTO conversations (buyer_id, agent_user_id, property_id, inquiry_id)
     VALUES (:buyerId, :agentUserId, :propertyId, :inquiryId)
     ON DUPLICATE KEY UPDATE conversation_id = LAST_INSERT_ID(conversation_id)`,
    { buyerId, agentUserId, propertyId: propertyId || null, inquiryId: inquiryId || null }
  );
  const [rows] = await pool.query('SELECT * FROM conversations WHERE conversation_id = :id LIMIT 1', {
    id: result.insertId,
  });
  return rows[0];
}

async function findById(conversationId) {
  const [rows] = await pool.query(
    'SELECT * FROM conversations WHERE conversation_id = :conversationId LIMIT 1',
    { conversationId }
  );
  return rows[0] || null;
}

async function listForUser(userId) {
  // Additive over the original query (existing columns are unchanged, so the
  // dashboard preview keeps working). Adds what an inbox needs: a truncated
  // last-message preview + its sender, the other party's avatar/role, and a
  // little property context (location, price, primary image).
  const [rows] = await pool.query(
    `SELECT c.*, p.title AS property_title,
            p.price AS property_price, p.listing_type AS property_listing_type,
            l.neighborhood AS property_neighborhood, l.city AS property_city,
            (SELECT pi.image_url FROM property_images pi
              WHERE pi.property_id = p.property_id AND pi.is_primary = TRUE LIMIT 1
            ) AS property_image_url,
            CASE WHEN c.buyer_id = :userId THEN c.agent_user_id ELSE c.buyer_id END AS other_user_id,
            ou.first_name AS other_first_name, ou.last_name AS other_last_name,
            ou.avatar_url AS other_avatar_url, ou.role AS other_role,
            LEFT(lm.message_text, 200) AS last_message_text,
            lm.sender_id AS last_message_sender_id,
            (SELECT COUNT(*) FROM messages m
              WHERE m.conversation_id = c.conversation_id AND m.sender_id != :userId AND m.is_read = FALSE
            ) AS unread_count
     FROM conversations c
     LEFT JOIN properties p ON p.property_id = c.property_id
     LEFT JOIN locations l ON l.location_id = p.location_id
     LEFT JOIN messages lm ON lm.message_id = (
       SELECT MAX(m2.message_id) FROM messages m2 WHERE m2.conversation_id = c.conversation_id
     )
     JOIN users ou ON ou.user_id = (CASE WHEN c.buyer_id = :userId THEN c.agent_user_id ELSE c.buyer_id END)
     WHERE c.buyer_id = :userId OR c.agent_user_id = :userId
     ORDER BY COALESCE(c.last_message_at, c.created_at) DESC`,
    { userId }
  );
  return rows;
}

function isParticipant(conversation, userId) {
  return conversation.buyer_id === userId || conversation.agent_user_id === userId;
}

module.exports = { findOrCreate, findById, listForUser, isParticipant };
