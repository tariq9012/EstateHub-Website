// src/models/recentlyViewed.model.js

const { pool } = require('../config/db');

/** Records/refreshes a view — a repeat view just bumps viewed_at instead of growing the table. */
async function recordView(userId, propertyId) {
  await pool.query(
    `INSERT INTO recently_viewed_properties (user_id, property_id)
     VALUES (:userId, :propertyId)
     ON DUPLICATE KEY UPDATE viewed_at = NOW()`,
    { userId, propertyId }
  );
}

async function listForUser(userId, limit = 20) {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
  const [rows] = await pool.query(
    `SELECT rv.view_id, rv.viewed_at,
            p.property_id, p.title, p.price, p.listing_type, p.bedrooms, p.bathrooms, p.status,
            pt.name AS type_name, l.city, l.country,
            (SELECT image_url FROM property_images pi WHERE pi.property_id = p.property_id AND pi.is_primary = TRUE LIMIT 1) AS primary_image_url
     FROM recently_viewed_properties rv
     JOIN properties p ON p.property_id = rv.property_id
     JOIN property_types pt ON pt.type_id = p.type_id
     JOIN locations l ON l.location_id = p.location_id
     WHERE rv.user_id = :userId
     ORDER BY rv.viewed_at DESC
     LIMIT ${safeLimit}`,
    { userId }
  );
  return rows;
}

module.exports = { recordView, listForUser };
