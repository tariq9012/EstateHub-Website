// src/models/location.model.js

const { pool } = require('../config/db');

/**
 * Finds an existing (neighborhood, city, state, country) row or creates one,
 * atomically — safe under concurrent requests since it relies on the unique index
 * (LOWER(neighborhood), LOWER(city), LOWER(state), LOWER(country)) via INSERT ... ON CONFLICT
 * rather than a separate SELECT-then-INSERT (which would race). The no-op DO UPDATE makes RETURNING
 * yield the existing row's id (DO NOTHING would return no row on a conflict).
 *
 * NOTE: neighborhood/state are stored as '' rather than NULL when omitted.
 * Both MySQL and PostgreSQL treat every NULL as *distinct* in a unique index, so NULL would
 * silently defeat the dedup. Empty string dedupes correctly (and keeps existing data valid).
 */
async function findOrCreate(executor, { neighborhood, city, state, country }) {
  const params = {
    neighborhood: neighborhood || '',
    city,
    state: state || '',
    country,
  };
  const result = await executor.query(
    `INSERT INTO locations (neighborhood, city, state, country)
     VALUES (:neighborhood, :city, :state, :country)
     ON CONFLICT (LOWER(neighborhood), LOWER(city), LOWER(state), LOWER(country))
     DO UPDATE SET city = locations.city
     RETURNING location_id`,
    params
  );
  return result.rows[0].location_id;
}

async function listAll() {
  const { rows } = await pool.query('SELECT * FROM locations ORDER BY city ASC, neighborhood ASC');
  return rows;
}

module.exports = { findOrCreate, listAll };