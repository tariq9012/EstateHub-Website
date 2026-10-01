// src/models/location.model.js

const { pool } = require('../config/db');

/**
 * Finds an existing (neighborhood, city, state, country) row or creates one,
 * atomically — safe under concurrent requests since it relies on the
 * UNIQUE(neighborhood, city, state, country) key rather than a separate
 * SELECT-then-INSERT (which would race).
 *
 * NOTE: neighborhood/state are stored as '' rather than NULL when omitted.
 * MySQL treats every NULL as *distinct* in a unique index, so NULL would
 * silently defeat the dedup (every "no state" insert would count as new).
 * Empty string does not have that problem and dedupes correctly.
 */
async function findOrCreate(executor, { neighborhood, city, state, country }) {
  const params = {
    neighborhood: neighborhood || '',
    city,
    state: state || '',
    country,
  };
  const [result] = await executor.query(
    `INSERT INTO locations (neighborhood, city, state, country)
     VALUES (:neighborhood, :city, :state, :country)
     ON DUPLICATE KEY UPDATE location_id = LAST_INSERT_ID(location_id)`,
    params
  );
  return result.insertId;
}

async function listAll() {
  const [rows] = await pool.query('SELECT * FROM locations ORDER BY city ASC, neighborhood ASC');
  return rows;
}

module.exports = { findOrCreate, listAll };