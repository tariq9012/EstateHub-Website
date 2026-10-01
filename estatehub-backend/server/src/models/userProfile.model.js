// src/models/userProfile.model.js

const { pool } = require('../config/db');

const ALLOWED_FIELDS = ['bio', 'address_line', 'city', 'state', 'country', 'postal_code', 'date_of_birth'];

async function findByUserId(userId) {
  const [rows] = await pool.query('SELECT * FROM user_profiles WHERE user_id = :userId LIMIT 1', { userId });
  return rows[0] || null;
}

/** Creates the profile row on first write, updates it on every write after. */
async function upsert(userId, fields) {
  const data = {};
  Object.entries(fields).forEach(([key, value]) => {
    if (ALLOWED_FIELDS.includes(key) && value !== undefined) data[key] = value;
  });

  const existing = await findByUserId(userId);

  if (existing) {
    const setClauses = Object.keys(data).map((key) => `${key} = :${key}`);
    if (setClauses.length > 0) {
      await pool.query(`UPDATE user_profiles SET ${setClauses.join(', ')} WHERE user_id = :userId`, {
        ...data,
        userId,
      });
    }
  } else {
    const columns = ['user_id', ...Object.keys(data)];
    const placeholders = columns.map((c) => (c === 'user_id' ? ':userId' : `:${c}`));
    await pool.query(
      `INSERT INTO user_profiles (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
      { ...data, userId }
    );
  }

  return findByUserId(userId);
}

module.exports = { findByUserId, upsert };
