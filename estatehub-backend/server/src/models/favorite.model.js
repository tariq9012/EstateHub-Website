// src/models/favorite.model.js

const { pool } = require('../config/db');

const UNIQUE_VIOLATION = '23505'; // PostgreSQL SQLSTATE unique_violation

async function add(userId, propertyId) {
  try {
    await pool.query('INSERT INTO favorites (user_id, property_id) VALUES (:userId, :propertyId)', {
      userId,
      propertyId,
    });
    return true;
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) return false; // already favorited — not an error
    throw err;
  }
}

async function remove(userId, propertyId) {
  const result = await pool.query(
    'DELETE FROM favorites WHERE user_id = :userId AND property_id = :propertyId',
    { userId, propertyId }
  );
  return result.rowCount > 0;
}

async function listForUser(userId) {
  const { rows } = await pool.query(
    `SELECT f.favorite_id, f.created_at AS favorited_at,
            p.property_id, p.title, p.price, p.listing_type, p.bedrooms, p.bathrooms,
            p.area_sqft, p.status,
            pt.name AS type_name, l.city, l.country,
            (SELECT image_url FROM property_images pi WHERE pi.property_id = p.property_id AND pi.is_primary = TRUE LIMIT 1) AS primary_image_url
     FROM favorites f
     JOIN properties p ON p.property_id = f.property_id
     JOIN property_types pt ON pt.type_id = p.type_id
     JOIN locations l ON l.location_id = p.location_id
     WHERE f.user_id = :userId
     ORDER BY f.created_at DESC`,
    { userId }
  );
  return rows;
}

module.exports = { add, remove, listForUser };
