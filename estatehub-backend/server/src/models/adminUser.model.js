// src/models/adminUser.model.js

const { pool } = require('../config/db');

async function findByUserId(userId) {
  const [rows] = await pool.query('SELECT * FROM admin_users WHERE user_id = :userId LIMIT 1', { userId });
  return rows[0] || null;
}

module.exports = { findByUserId };