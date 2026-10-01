// src/models/user.model.js

const { pool } = require('../config/db');

/**
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} executor
 */
async function createUser(executor, { email, passwordHash, role, firstName, lastName, phone }) {
  const [result] = await executor.query(
    `INSERT INTO users (email, password_hash, role, first_name, last_name, phone)
     VALUES (:email, :passwordHash, :role, :firstName, :lastName, :phone)`,
    { email, passwordHash, role, firstName, lastName, phone: phone || null }
  );
  return result.insertId;
}

async function findByEmail(email) {
  const [rows] = await pool.query('SELECT * FROM users WHERE email = :email LIMIT 1', { email });
  return rows[0] || null;
}

async function findById(userId) {
  const [rows] = await pool.query('SELECT * FROM users WHERE user_id = :userId LIMIT 1', { userId });
  return rows[0] || null;
}

/** Strips password_hash before a user row is ever sent in an API response. */
function toSafeUser(user) {
  if (!user) return null;
  // eslint-disable-next-line no-unused-vars
  const { password_hash, ...safe } = user;
  return safe;
}

/** Used by reset-password (and, in future, an authenticated change-password flow). */
async function updatePasswordHash(userId, passwordHash) {
  await pool.query('UPDATE users SET password_hash = :passwordHash WHERE user_id = :userId', {
    userId,
    passwordHash,
  });
}

module.exports = { createUser, findByEmail, findById, toSafeUser, updatePasswordHash };