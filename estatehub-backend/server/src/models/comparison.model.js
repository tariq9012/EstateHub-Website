// src/models/comparison.model.js
// A user has one ongoing comparison "basket" at a time (most-recently
// created row), rather than requiring them to explicitly name/create one —
// matches how compare tools normally work in the UI.

const { pool } = require('../config/db');

async function createComparison(userId) {
  const [result] = await pool.query('INSERT INTO property_comparisons (user_id) VALUES (:userId)', { userId });
  return result.insertId;
}

async function findLatestForUser(userId) {
  const [rows] = await pool.query(
    'SELECT * FROM property_comparisons WHERE user_id = :userId ORDER BY created_at DESC LIMIT 1',
    { userId }
  );
  return rows[0] || null;
}

async function findById(comparisonId) {
  const [rows] = await pool.query(
    'SELECT * FROM property_comparisons WHERE comparison_id = :comparisonId LIMIT 1',
    { comparisonId }
  );
  return rows[0] || null;
}

async function addItem(comparisonId, propertyId) {
  try {
    await pool.query(
      'INSERT INTO property_comparison_items (comparison_id, property_id) VALUES (:comparisonId, :propertyId)',
      { comparisonId, propertyId }
    );
    return true;
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return false;
    throw err;
  }
}

async function removeItem(comparisonId, propertyId) {
  const [result] = await pool.query(
    'DELETE FROM property_comparison_items WHERE comparison_id = :comparisonId AND property_id = :propertyId',
    { comparisonId, propertyId }
  );
  return result.affectedRows > 0;
}

async function listItems(comparisonId) {
  const [rows] = await pool.query(
    `SELECT p.property_id, p.title, p.price, p.listing_type, p.bedrooms, p.bathrooms, p.area_sqft, p.status,
            pt.name AS type_name, l.city, l.country,
            (SELECT image_url FROM property_images pi WHERE pi.property_id = p.property_id AND pi.is_primary = TRUE LIMIT 1) AS primary_image_url
     FROM property_comparison_items pci
     JOIN properties p ON p.property_id = pci.property_id
     JOIN property_types pt ON pt.type_id = p.type_id
     JOIN locations l ON l.location_id = p.location_id
     WHERE pci.comparison_id = :comparisonId
     ORDER BY pci.added_at ASC`,
    { comparisonId }
  );
  return rows;
}

module.exports = { createComparison, findLatestForUser, findById, addItem, removeItem, listItems };
