// src/models/inquiry.model.js

const { pool } = require('../config/db');

async function create({ propertyId, userId, agentId, message, preferredVisitDate }) {
  const [result] = await pool.query(
    `INSERT INTO inquiries (property_id, user_id, agent_id, message, preferred_visit_date)
     VALUES (:propertyId, :userId, :agentId, :message, :preferredVisitDate)`,
    { propertyId, userId, agentId: agentId || null, message, preferredVisitDate: preferredVisitDate || null }
  );
  return result.insertId;
}

async function findById(inquiryId) {
  const [rows] = await pool.query('SELECT * FROM inquiries WHERE inquiry_id = :inquiryId LIMIT 1', {
    inquiryId,
  });
  return rows[0] || null;
}

async function listForUser(userId) {
  const [rows] = await pool.query(
    `SELECT i.*, p.title AS property_title
     FROM inquiries i JOIN properties p ON p.property_id = i.property_id
     WHERE i.user_id = :userId ORDER BY i.created_at DESC`,
    { userId }
  );
  return rows;
}

async function listReceivedByAgent(agentId) {
  const [rows] = await pool.query(
    `SELECT i.*, p.title AS property_title, p.status AS property_status,
            (SELECT pi.image_url FROM property_images pi WHERE pi.property_id = p.property_id AND pi.is_primary = TRUE LIMIT 1) AS property_image_url,
            u.first_name, u.last_name, u.email, u.avatar_url AS buyer_avatar_url,
            c.conversation_id AS conversation_id
     FROM inquiries i
     JOIN properties p ON p.property_id = i.property_id
     JOIN users u ON u.user_id = i.user_id
     JOIN agents ag ON ag.agent_id = i.agent_id
     LEFT JOIN conversations c
            ON c.buyer_id = i.user_id AND c.agent_user_id = ag.user_id AND c.property_id = i.property_id
     WHERE i.agent_id = :agentId ORDER BY i.created_at DESC`,
    { agentId }
  );
  return rows;
}

async function updateStatus(inquiryId, status) {
  await pool.query('UPDATE inquiries SET status = :status WHERE inquiry_id = :inquiryId', {
    inquiryId,
    status,
  });
}

module.exports = { create, findById, listForUser, listReceivedByAgent, updateStatus };
