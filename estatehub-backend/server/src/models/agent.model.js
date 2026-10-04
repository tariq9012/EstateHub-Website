// src/models/agent.model.js

const { pool } = require('../config/db');

async function createAgent(executor, { userId, licenseNumber, agencyName, specialty, yearsExperience }) {
  const result = await executor.query(
    `INSERT INTO agents (user_id, license_number, agency_name, specialty, years_experience)
     VALUES (:userId, :licenseNumber, :agencyName, :specialty, :yearsExperience) RETURNING agent_id`,
    {
      userId,
      licenseNumber,
      agencyName: agencyName || null,
      specialty: specialty || null,
      yearsExperience: yearsExperience || null,
    }
  );
  return result.rows[0].agent_id;
}

async function findByUserId(userId) {
  const { rows } = await pool.query('SELECT * FROM agents WHERE user_id = :userId LIMIT 1', { userId });
  return rows[0] || null;
}

async function findByLicenseNumber(licenseNumber) {
  const { rows } = await pool.query(
    'SELECT * FROM agents WHERE LOWER(license_number) = LOWER(:licenseNumber) LIMIT 1',
    { licenseNumber }
  );
  return rows[0] || null;
}

/** Public profile view — agent + user contact info + agent_profiles bio/links. */
async function findFullById(agentId) {
  const { rows } = await pool.query(
    `SELECT a.*, u.first_name, u.last_name, u.email, u.phone, u.avatar_url,
            ap.bio, ap.company_website, ap.office_address, ap.social_links_json
     FROM agents a
     JOIN users u ON u.user_id = a.user_id
     LEFT JOIN agent_profiles ap ON ap.agent_id = a.agent_id
     WHERE a.agent_id = :agentId
     LIMIT 1`,
    { agentId }
  );
  return rows[0] || null;
}

/** FindAnAgent search/filter/pagination. */
async function search({ specialty, minRating, verifiedOnly, keyword, city, page = 1, limit = 12 } = {}) {
  const conditions = [];
  const params = {};

  if (specialty) {
    conditions.push('a.specialty = :specialty');
    params.specialty = specialty;
  }
  if (minRating != null) {
    conditions.push('a.average_rating >= :minRating');
    params.minRating = minRating;
  }
  if (verifiedOnly) {
    conditions.push("a.verification_status = 'verified'");
  }
  if (keyword) {
    conditions.push('(u.first_name ILIKE :keyword OR u.last_name ILIKE :keyword OR a.agency_name ILIKE :keyword)');
    params.keyword = `%${keyword}%`;
  }
  if (city) {
    // "Location" for an agent is derived from where they've listed properties —
    // no separate service-area field exists (or is needed) on agents.
    conditions.push(
      `EXISTS (
         SELECT 1 FROM properties p
         JOIN locations l ON l.location_id = p.location_id
         WHERE p.agent_id = a.agent_id AND l.city ILIKE :city
       )`
    );
    params.city = `%${city}%`;
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 12, 1), 50);
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const { rows } = await pool.query(
    `SELECT a.agent_id, a.agency_name, a.specialty, a.years_experience, a.verification_status,
            a.average_rating, a.total_reviews,
            u.first_name, u.last_name, u.avatar_url,
            (SELECT COUNT(*) FROM properties p WHERE p.agent_id = a.agent_id AND p.status = 'active') AS active_listings_count
     FROM agents a
     JOIN users u ON u.user_id = a.user_id
     ${whereClause}
     ORDER BY a.average_rating DESC
     LIMIT ${safeLimit} OFFSET ${offset}`,
    params
  );

  const { rows: countRows } = await pool.query(`SELECT COUNT(*) AS total FROM agents a JOIN users u ON u.user_id = a.user_id ${whereClause}`, params);
  const total = countRows[0].total;

  return {
    agents: rows,
    pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) || 0 },
  };
}

async function listByVerificationStatus(status) {
  const { rows } = await pool.query(
    `SELECT a.agent_id, a.license_number, a.verification_status, a.license_expiry_date, a.created_at,
            u.first_name, u.last_name, u.email
     FROM agents a JOIN users u ON u.user_id = a.user_id
     WHERE a.verification_status = :status
     ORDER BY a.created_at ASC`,
    { status }
  );
  return rows;
}

async function updateAgentFields(agentId, fields) {
  const allowed = ['agency_name', 'specialty', 'years_experience', 'license_expiry_date'];
  const setClauses = [];
  const params = { agentId };

  Object.entries(fields).forEach(([key, value]) => {
    if (allowed.includes(key) && value !== undefined) {
      setClauses.push(`${key} = :${key}`);
      params[key] = value;
    }
  });

  if (setClauses.length === 0) return false;
  await pool.query(`UPDATE agents SET ${setClauses.join(', ')} WHERE agent_id = :agentId`, params);
  return true;
}

/**
 * Compare-and-set: an agent can only be verified while their verification is 'pending' (i.e. they
 * submitted it for review). Sets verified_at. Returns true if applied.
 */
async function verifyAgent(agentId, verifiedBy) {
  const result = await pool.query(
    `UPDATE agents SET verification_status = 'verified', verified_by = :verifiedBy, verified_at = NOW()
     WHERE agent_id = :agentId AND verification_status = 'pending'`,
    { agentId, verifiedBy }
  );
  return result.rowCount === 1;
}

/**
 * Compare-and-set: only from 'pending'. Does NOT set verified_at (the agent was never verified).
 * Returns true if applied.
 */
async function rejectAgentVerification(agentId, verifiedBy) {
  const result = await pool.query(
    `UPDATE agents SET verification_status = 'rejected', verified_by = :verifiedBy
     WHERE agent_id = :agentId AND verification_status = 'pending'`,
    { agentId, verifiedBy }
  );
  return result.rowCount === 1;
}

/**
 * unverified|rejected -> pending. Compare-and-set so it can't overwrite an admin's decision.
 * Deliberately does NOT touch verified_by / verified_at (those record an admin's decision).
 * Returns true if this call moved the agent into review.
 */
async function submitForVerification(agentId) {
  const result = await pool.query(
    `UPDATE agents SET verification_status = 'pending'
     WHERE agent_id = :agentId AND verification_status IN ('unverified', 'rejected')`,
    { agentId }
  );
  return result.rowCount === 1;
}

async function updateLicenseExpiry(agentId, newExpiryDate) {
  await pool.query('UPDATE agents SET license_expiry_date = :newExpiryDate WHERE agent_id = :agentId', {
    agentId,
    newExpiryDate,
  });
}

module.exports = {
  createAgent,
  findByUserId,
  findByLicenseNumber,
  findFullById,
  search,
  listByVerificationStatus,
  updateAgentFields,
  verifyAgent,
  rejectAgentVerification,
  submitForVerification,
  updateLicenseExpiry,
};