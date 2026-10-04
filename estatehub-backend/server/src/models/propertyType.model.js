// src/models/propertyType.model.js

const { pool } = require('../config/db');

async function listAll() {
  const { rows } = await pool.query('SELECT type_id, name, description FROM property_types ORDER BY name ASC');
  return rows;
}

async function findById(typeId) {
  const { rows } = await pool.query('SELECT * FROM property_types WHERE type_id = :typeId LIMIT 1', { typeId });
  return rows[0] || null;
}

module.exports = { listAll, findById };