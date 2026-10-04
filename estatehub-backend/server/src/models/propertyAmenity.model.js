// src/models/propertyAmenity.model.js

const { pool } = require('../config/db');

/** Replaces a property's full amenity set with the given list of amenity IDs. */
async function setForProperty(propertyId, amenityIds) {
  await pool.withTransaction(async (tx) => {
    await tx.query('DELETE FROM property_amenities WHERE property_id = :propertyId', { propertyId });

    if (amenityIds.length > 0) {
      // Single bound int[] parameter (no string-built VALUES list): UNNEST expands it to one row per amenity.
      await tx.query(
        'INSERT INTO property_amenities (property_id, amenity_id) SELECT :propertyId::int, UNNEST(:amenityIds::int[])',
        { propertyId, amenityIds }
      );
    }
  });
}

async function listForProperty(propertyId) {
  const { rows } = await pool.query(
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