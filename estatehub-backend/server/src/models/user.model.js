// src/models/user.model.js

const { pool } = require('../config/db');

/**
 * @param {{ query: Function }} executor  config/db `pool`, or the `tx` handed to pool.withTransaction()
 */
async function createUser(executor, { email, passwordHash, role, firstName, lastName, phone }) {
  const result = await executor.query(
    `INSERT INTO users (email, password_hash, role, first_name, last_name, phone)
     VALUES (:email, :passwordHash, :role, :firstName, :lastName, :phone) RETURNING user_id`,
    { email, passwordHash, role, firstName, lastName, phone: phone || null }
  );
  return result.rows[0].user_id;
}

async function findByEmail(email) {
  // MySQL's utf8mb4_unicode_ci made this lookup case-insensitive; PostgreSQL is case-sensitive, so it is explicit
  // here (backed by the unique index on LOWER(email), which also stops 'A@x.com' and 'a@x.com' both registering).
  const { rows } = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER(:email) LIMIT 1', { email });
  return rows[0] || null;
}

async function findById(userId) {
  const { rows } = await pool.query('SELECT * FROM users WHERE user_id = :userId LIMIT 1', { userId });
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