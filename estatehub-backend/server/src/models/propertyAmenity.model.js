// src/models/propertyAmenity.model.js

const { pool } = require('../config/db');

/** Replaces a property's full amenity set with the given list of amenity IDs. */
async function setForProperty(propertyId, amenityIds) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    await connection.query('DELETE FROM property_amenities WHERE property_id = :propertyId', { propertyId });

    if (amenityIds.length > 0) {
      const values = amenityIds.map((amenityId) => [propertyId, amenityId]);
      await connection.query('INSERT INTO property_amenities (property_id, amenity_id) VALUES ?', [values]);
    }

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function listForProperty(propertyId) {
  const [rows] = await pool.query(
    `SELECT a.amenity_id, a.name, a.icon
     FROM property_amenities pa
     JOIN amenities a ON a.amenity_id = pa.amenity_id
     WHERE pa.property_id = :propertyId
     ORDER BY a.name ASC`,
    { propertyId }
  );
  return rows;
}

module.exports = { setForProperty, listForProperty };