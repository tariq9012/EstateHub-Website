// src/models/propertyReview.model.js

const { pool } = require('../config/db');

const UNIQUE_VIOLATION = '23505'; // PostgreSQL SQLSTATE unique_violation

async function create({ propertyId, userId, rating, comment }) {
  try {
    await pool.query(
      `INSERT INTO property_reviews (property_id, user_id, rating, comment)
       VALUES (:propertyId, :userId, :rating, :comment)`,
      { propertyId, userId, rating, comment: comment || null }
    );
    return true;
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) return false; // one review per user per property
    throw err;
  }
}

async function listForProperty(propertyId) {
  const { rows } = await pool.query(
    `SELECT pr.review_id, pr.property_id, pr.user_id, pr.rating, pr.comment, pr.created_at,
            u.first_name, u.last_name
     FROM property_reviews pr
     JOIN users u ON u.user_id = pr.user_id
     WHERE pr.property_id = :propertyId
     ORDER BY pr.created_at DESC`,
    { propertyId }
  );
  return rows;
}

async function findById(reviewId) {
  const { rows } = await pool.query('SELECT * FROM property_reviews WHERE review_id = :reviewId LIMIT 1', {
    reviewId,
  });
  return rows[0] || null;
}

async function update(reviewId, { rating, comment }) {
  await pool.query('UPDATE property_reviews SET rating = :rating, comment = :comment WHERE review_id = :reviewId', {
    reviewId,
    rating,
    comment: comment || null,
  });
}

async function remove(reviewId) {
  await pool.query('DELETE FROM property_reviews WHERE review_id = :reviewId', { reviewId });
}

module.exports = { create, listForProperty, findById, update, remove };