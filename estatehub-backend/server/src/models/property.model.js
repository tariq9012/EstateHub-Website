// src/models/property.model.js

const { pool } = require('../config/db');

const SORT_MAP = {
  newest: 'p.created_at DESC',
  oldest: 'p.created_at ASC',
  price_asc: 'p.price ASC',
  price_desc: 'p.price DESC',
};

async function createProperty(
  executor,
  {
    listedByUserId,
    agentId,
    typeId,
    locationId,
    title,
    description,
    addressLine,
    postalCode,
    latitude,
    longitude,
    price,
    listingType,
    bedrooms,
    bathrooms,
    areaSqft,
    lotSizeSqft,
    yearBuilt,
    status,
  }
) {
  const [result] = await executor.query(
    `INSERT INTO properties
      (listed_by_user_id, agent_id, type_id, location_id, title, description,
       address_line, postal_code, latitude, longitude, price, listing_type,
       bedrooms, bathrooms, area_sqft, lot_size_sqft, year_built, status)
     VALUES
      (:listedByUserId, :agentId, :typeId, :locationId, :title, :description,
       :addressLine, :postalCode, :latitude, :longitude, :price, :listingType,
       :bedrooms, :bathrooms, :areaSqft, :lotSizeSqft, :yearBuilt, :status)`,
    {
      listedByUserId,
      agentId: agentId || null,
      typeId,
      locationId,
      title,
      description: description || null,
      addressLine,
      postalCode: postalCode || null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      price,
      listingType: listingType || 'sale',
      bedrooms: bedrooms ?? null,
      bathrooms: bathrooms ?? null,
      areaSqft: areaSqft ?? null,
      lotSizeSqft: lotSizeSqft ?? null,
      yearBuilt: yearBuilt ?? null,
      status: status === 'draft' ? 'draft' : 'pending_review',
    }
  );
  return result.insertId;
}

/** Full detail view: property + type/location + images + amenities. */
async function findById(propertyId) {
  const [rows] = await pool.query(
    `SELECT p.*, pt.name AS type_name,
            l.neighborhood, l.city, l.state, l.country,
            u.first_name AS lister_first_name, u.last_name AS lister_last_name
     FROM properties p
     JOIN property_types pt ON pt.type_id = p.type_id
     JOIN locations l ON l.location_id = p.location_id
     JOIN users u ON u.user_id = p.listed_by_user_id
     WHERE p.property_id = :propertyId
     LIMIT 1`,
    { propertyId }
  );
  const property = rows[0];
  if (!property) return null;

  const [images] = await pool.query(
    `SELECT image_id, image_url, alt_text, is_primary, display_order
     FROM property_images WHERE property_id = :propertyId ORDER BY display_order ASC`,
    { propertyId }
  );

  const [amenities] = await pool.query(
    `SELECT a.amenity_id, a.name, a.icon
     FROM property_amenities pa JOIN amenities a ON a.amenity_id = pa.amenity_id
     WHERE pa.property_id = :propertyId`,
    { propertyId }
  );

  return { ...property, images, amenities };
}

/** Minimal row — used for ownership checks without the full join cost. */
async function findOwnerInfo(propertyId) {
  const [rows] = await pool.query(
    'SELECT property_id, listed_by_user_id, agent_id, status FROM properties WHERE property_id = :propertyId LIMIT 1',
    { propertyId }
  );
  return rows[0] || null;
}

async function findByOwner(userId) {
  const [rows] = await pool.query(
    `SELECT p.*, pt.name AS type_name, l.city, l.country,
            (SELECT image_url FROM property_images pi WHERE pi.property_id = p.property_id AND pi.is_primary = TRUE LIMIT 1) AS primary_image_url
     FROM properties p
     JOIN property_types pt ON pt.type_id = p.type_id
     JOIN locations l ON l.location_id = p.location_id
     WHERE p.listed_by_user_id = :userId
     ORDER BY p.created_at DESC`,
    { userId }
  );
  return rows;
}

/** Every listing assigned to an agent — distinct from findByOwner, which is scoped to who submitted the listing. */
async function findByAgent(agentId) {
  // Additive extras for the agent's "My Listings" page: location detail + activity counts.
  const [rows] = await pool.query(
    `SELECT p.*, pt.name AS type_name, l.city, l.country, l.neighborhood,
            (SELECT image_url FROM property_images pi WHERE pi.property_id = p.property_id AND pi.is_primary = TRUE LIMIT 1) AS primary_image_url,
            (SELECT COUNT(*) FROM property_images pi2 WHERE pi2.property_id = p.property_id) AS image_count,
            (SELECT COUNT(*) FROM inquiries i WHERE i.property_id = p.property_id) AS inquiry_count
     FROM properties p
     JOIN property_types pt ON pt.type_id = p.type_id
     JOIN locations l ON l.location_id = p.location_id
     WHERE p.agent_id = :agentId
     ORDER BY p.created_at DESC`,
    { agentId }
  );
  return rows;
}

/**
 * Dynamic search with filters, pagination, and sorting.
 * `status` defaults to 'active' — the public browse endpoint should never
 * expose draft/pending/rejected listings.
 */
async function search({
  status = 'active',
  typeId,
  listingType,
  minPrice,
  maxPrice,
  minBedrooms,
  minBathrooms,
  minYearBuilt,
  maxYearBuilt,
  city,
  agentId,
  amenityIds,
  keyword,
  page = 1,
  limit = 12,
  sortBy = 'newest',
} = {}) {
  const conditions = [];
  const params = {};

  // `status` may be a single value or an array of values — callers (the public browse
  // endpoint) are responsible for only ever passing publicly-safe statuses here; this
  // function does not itself restrict which statuses may be queried.
  const statusList = (Array.isArray(status) ? status : [status]).filter(Boolean);
  if (statusList.length === 0) statusList.push('active');
  if (statusList.length === 1) {
    conditions.push('p.status = :status');
    params.status = statusList[0];
  } else {
    const statusPlaceholders = statusList.map((_, i) => `:status${i}`).join(',');
    statusList.forEach((s, i) => {
      params[`status${i}`] = s;
    });
    conditions.push(`p.status IN (${statusPlaceholders})`);
  }

  if (typeId) {
    conditions.push('p.type_id = :typeId');
    params.typeId = typeId;
  }
  if (listingType) {
    conditions.push('p.listing_type = :listingType');
    params.listingType = listingType;
  }
  if (minPrice != null) {
    conditions.push('p.price >= :minPrice');
    params.minPrice = minPrice;
  }
  if (maxPrice != null) {
    conditions.push('p.price <= :maxPrice');
    params.maxPrice = maxPrice;
  }
  if (minBedrooms != null) {
    conditions.push('p.bedrooms >= :minBedrooms');
    params.minBedrooms = minBedrooms;
  }
  if (minBathrooms != null) {
    conditions.push('p.bathrooms >= :minBathrooms');
    params.minBathrooms = minBathrooms;
  }
  if (minYearBuilt != null) {
    conditions.push('p.year_built >= :minYearBuilt');
    params.minYearBuilt = minYearBuilt;
  }
  if (maxYearBuilt != null) {
    conditions.push('p.year_built <= :maxYearBuilt');
    params.maxYearBuilt = maxYearBuilt;
  }
  if (city) {
    conditions.push('l.city LIKE :city');
    params.city = `%${city}%`;
  }
  if (agentId) {
    conditions.push('p.agent_id = :agentId');
    params.agentId = agentId;
  }
  if (keyword) {
    conditions.push('(p.title LIKE :keyword OR p.description LIKE :keyword)');
    params.keyword = `%${keyword}%`;
  }
  if (amenityIds && amenityIds.length > 0) {
    const placeholders = amenityIds.map((_, i) => `:amenity${i}`).join(',');
    amenityIds.forEach((id, i) => {
      params[`amenity${i}`] = id;
    });
    conditions.push(
      `p.property_id IN (
         SELECT pa.property_id FROM property_amenities pa
         WHERE pa.amenity_id IN (${placeholders})
         GROUP BY pa.property_id
         HAVING COUNT(DISTINCT pa.amenity_id) = ${amenityIds.length}
       )`
    );
  }

  const whereClause = conditions.join(' AND ');
  const orderClause = SORT_MAP[sortBy] || SORT_MAP.newest;

  // page/limit are always pre-clamped integers by the controller before
  // reaching here, so interpolating them directly is safe (no user string
  // ever reaches this point unescaped).
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 12, 1), 50);
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const [rows] = await pool.query(
    `SELECT p.property_id, p.title, p.price, p.listing_type, p.bedrooms, p.bathrooms,
            p.area_sqft, p.status, p.is_featured, p.created_at,
            pt.name AS type_name, l.neighborhood, l.city, l.state, l.country,
            (SELECT image_url FROM property_images pi WHERE pi.property_id = p.property_id AND pi.is_primary = TRUE LIMIT 1) AS primary_image_url
     FROM properties p
     JOIN property_types pt ON pt.type_id = p.type_id
     JOIN locations l ON l.location_id = p.location_id
     WHERE ${whereClause}
     ORDER BY ${orderClause}
     LIMIT ${safeLimit} OFFSET ${offset}`,
    params
  );

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM properties p
     JOIN locations l ON l.location_id = p.location_id
     WHERE ${whereClause}`,
    params
  );

  const total = countRows[0].total;

  return {
    properties: rows,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit) || 0,
    },
  };
}

/** Only a fixed whitelist of columns is ever updatable through this function. */
async function updateProperty(propertyId, fields) {
  const allowed = [
    'title',
    'description',
    'address_line',
    'postal_code',
    'latitude',
    'longitude',
    'price',
    'listing_type',
    'bedrooms',
    'bathrooms',
    'area_sqft',
    'lot_size_sqft',
    'year_built',
    'type_id',
    'location_id',
  ];

  const setClauses = [];
  const params = { propertyId };

  Object.entries(fields).forEach(([key, value]) => {
    if (allowed.includes(key)) {
      setClauses.push(`${key} = :${key}`);
      params[key] = value;
    }
  });

  if (setClauses.length === 0) return false;

  await pool.query(`UPDATE properties SET ${setClauses.join(', ')} WHERE property_id = :propertyId`, params);
  return true;
}

/**
 * Compare-and-set: only a listing still in 'pending_review' can be approved. Prevents an admin
 * (or a replayed/forged request) from "approving" a listing that is already active, sold, under
 * contract, or archived. Returns true if the transition was applied.
 */
async function approveProperty(propertyId, adminId) {
  const [result] = await pool.query(
    `UPDATE properties
     SET status = 'active', approved_by = :adminId, approved_at = NOW(), rejection_reason = NULL
     WHERE property_id = :propertyId AND status = 'pending_review'`,
    { propertyId, adminId }
  );
  return result.affectedRows === 1;
}

/**
 * Compare-and-set: only a listing still in 'pending_review' can be rejected. Returns true if the
 * transition was applied.
 */
async function rejectProperty(propertyId, adminId, reason) {
  const [result] = await pool.query(
    `UPDATE properties
     SET status = 'rejected', approved_by = :adminId, approved_at = NOW(), rejection_reason = :reason
     WHERE property_id = :propertyId AND status = 'pending_review'`,
    { propertyId, adminId, reason }
  );
  return result.affectedRows === 1;
}

/**
 * Compare-and-set status change: only applies if the listing is still in `fromStatus`, so an
 * owner's edit can never overwrite an admin decision made in the meantime. Returns true if changed.
 */
async function transitionStatus(propertyId, fromStatus, toStatus, { clearRejection = false } = {}) {
  const [result] = await pool.query(
    `UPDATE properties SET status = :toStatus${clearRejection ? ', rejection_reason = NULL' : ''}
     WHERE property_id = :propertyId AND status = :fromStatus`,
    { propertyId, fromStatus, toStatus }
  );
  return result.affectedRows === 1;
}

async function archiveProperty(propertyId) {
  await pool.query(`UPDATE properties SET status = 'archived' WHERE property_id = :propertyId`, { propertyId });
}

async function incrementViewCount(propertyId) {
  await pool.query('UPDATE properties SET view_count = view_count + 1 WHERE property_id = :propertyId', {
    propertyId,
  });
}

module.exports = {
  createProperty,
  findById,
  findOwnerInfo,
  findByOwner,
  findByAgent,
  search,
  updateProperty,
  approveProperty,
  rejectProperty,
  archiveProperty,
  incrementViewCount,
  transitionStatus,
};