// src/models/propertyImage.model.js

const { pool } = require('../config/db');

async function countByProperty(propertyId) {
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS cnt FROM property_images WHERE property_id = :propertyId',
    { propertyId }
  );
  return rows[0].cnt;
}

/**
 * Inserts a batch of images for a property. The very first image ever
 * added to a property (i.e. uploaded when it had zero images) is marked
 * as primary automatically.
 */
async function addImages(propertyId, images) {
  const existingCount = await countByProperty(propertyId);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const insertedIds = [];
    let order = existingCount;

    for (let i = 0; i < images.length; i += 1) {
      const isPrimary = existingCount === 0 && i === 0;
      const [result] = await connection.query(
        `INSERT INTO property_images (property_id, image_url, alt_text, is_primary, display_order)
         VALUES (:propertyId, :imageUrl, :altText, :isPrimary, :displayOrder)`,
        {
          propertyId,
          imageUrl: images[i].imageUrl,
          altText: images[i].altText || null,
          isPrimary,
          displayOrder: order,
        }
      );
      insertedIds.push(result.insertId);
      order += 1;
    }

    await connection.commit();
    return insertedIds;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function listByProperty(propertyId) {
  const [rows] = await pool.query(
    'SELECT * FROM property_images WHERE property_id = :propertyId ORDER BY display_order ASC',
    { propertyId }
  );
  return rows;
}

async function findById(imageId) {
  const [rows] = await pool.query('SELECT * FROM property_images WHERE image_id = :imageId LIMIT 1', { imageId });
  return rows[0] || null;
}

/**
 * Deletes one image of a property. Returns the deleted row ({ image_url, is_primary, ... }) so the
 * caller can remove the file from disk, or null if it doesn't exist / belongs to another property.
 */
async function deleteImage(imageId, propertyId) {
  const [rows] = await pool.query(
    'SELECT * FROM property_images WHERE image_id = :imageId AND property_id = :propertyId LIMIT 1',
    { imageId, propertyId }
  );
  const image = rows[0];
  if (!image) return null;
  await pool.query('DELETE FROM property_images WHERE image_id = :imageId AND property_id = :propertyId', {
    imageId,
    propertyId,
  });
  return image;
}

/** If a property has images but none is primary (e.g. the primary was deleted), promote the first. */
async function ensurePrimary(propertyId) {
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS cnt FROM property_images WHERE property_id = :propertyId AND is_primary = TRUE',
    { propertyId }
  );
  if (rows[0].cnt > 0) return;
  await pool.query(
    `UPDATE property_images SET is_primary = TRUE
     WHERE image_id = (SELECT image_id FROM (
       SELECT image_id FROM property_images WHERE property_id = :propertyId ORDER BY display_order ASC, image_id ASC LIMIT 1
     ) first_image)`,
    { propertyId }
  );
}

/** Makes one image the primary. Returns false if the image doesn't belong to the property. */
async function setPrimary(imageId, propertyId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      'SELECT image_id FROM property_images WHERE image_id = :imageId AND property_id = :propertyId FOR UPDATE',
      { imageId, propertyId }
    );
    if (!rows[0]) {
      await connection.rollback();
      return false;
    }
    await connection.query('UPDATE property_images SET is_primary = FALSE WHERE property_id = :propertyId', { propertyId });
    await connection.query('UPDATE property_images SET is_primary = TRUE WHERE image_id = :imageId', { imageId });
    await connection.commit();
    return true;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

module.exports = { addImages, listByProperty, findById, deleteImage, ensurePrimary, setPrimary, countByProperty };