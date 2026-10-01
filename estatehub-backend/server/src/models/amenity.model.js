// src/models/amenity.model.js

const { pool } = require('../config/db');

async function listAll() {
  const [rows] = await pool.query('SELECT amenity_id, name, icon FROM amenities ORDER BY name ASC');
  return rows;
}

module.exports = { listAll };