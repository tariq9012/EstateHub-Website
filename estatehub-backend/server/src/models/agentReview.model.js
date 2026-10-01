// src/models/agentReview.model.js

const { pool } = require('../config/db');

async function create({ agentId, userId, rating, comment }) {
  try {
    await pool.query(
      `INSERT INTO agent_reviews (agent_id, user_id, rating, comment)
       VALUES (:agentId, :userId, :rating, :comment)`,
      { agentId, userId, rating, comment: comment || null }
    );
    return true;
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return false; // one review per user per agent
    throw err;
  }
}

async function listForAgent(agentId) {
  const [rows] = await pool.query(
    `SELECT ar.review_id, ar.rating, ar.comment, ar.created_at, u.first_name, u.last_name
     FROM agent_reviews ar
     JOIN users u ON u.user_id = ar.user_id
     WHERE ar.agent_id = :agentId
     ORDER BY ar.created_at DESC`,
    { agentId }
  );
  return rows;
}

/**
 * Recomputes agents.average_rating / total_reviews from the actual
 * agent_reviews rows. Call this after any insert/update/delete of a review
 * — those two columns are a denormalized cache purely for fast reads on
 * listing/search pages; agent_reviews remains the source of truth.
 */
async function recalculateAgentRating(agentId) {
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS cnt, COALESCE(AVG(rating), 0) AS avgRating FROM agent_reviews WHERE agent_id = :agentId',
    { agentId }
  );
  const { cnt, avgRating } = rows[0];
  await pool.query('UPDATE agents SET average_rating = :avgRating, total_reviews = :cnt WHERE agent_id = :agentId', {
    avgRating,
    cnt,
    agentId,
  });
}

module.exports = { create, listForAgent, recalculateAgentRating };
