// src/models/admin.model.js

const { pool } = require('../config/db');

async function getDashboardStats() {
  const [[userStats]] = await pool.query(
    `SELECT
       COUNT(*) AS totalUsers,
       SUM(role = 'buyer') AS totalBuyers,
       SUM(role = 'agent') AS totalAgents,
       SUM(role = 'admin') AS totalAdmins,
       SUM(status = 'active') AS activeUsers,
       SUM(status = 'suspended') AS suspendedUsers
     FROM users`
  );

  const [[propertyStats]] = await pool.query(
    `SELECT
       COUNT(*) AS totalProperties,
       SUM(status = 'active') AS activeProperties,
       SUM(status = 'pending_review') AS pendingProperties,
       SUM(status = 'rejected') AS rejectedProperties,
       SUM(status = 'sold') AS soldProperties,
       SUM(status = 'archived') AS archivedProperties
     FROM properties`
  );

  const [[agentStats]] = await pool.query(
    `SELECT
       COUNT(*) AS totalAgents,
       SUM(verification_status = 'pending') AS pendingVerifications,
       SUM(verification_status = 'verified') AS verifiedAgents,
       SUM(verification_status = 'unverified') AS unverifiedAgents
     FROM agents`
  );

  const [[renewalStats]] = await pool.query(
    `SELECT
       SUM(status = 'submitted') AS submittedRenewals,
       SUM(status = 'under_review') AS underReviewRenewals,
       SUM(status = 'missing_documents') AS missingDocRenewals
     FROM license_renewals`
  );

  const [[inquiryStats]] = await pool.query(
    `SELECT COUNT(*) AS totalInquiries, SUM(status = 'new') AS newInquiries FROM inquiries`
  );

  // Small real-data previews so the dashboard can show "Pending property approvals",
  // "Pending agent verifications", "Pending license renewals" and "Recent admin actions"
  // sections without a second round-trip from the frontend.
  const [pendingProperties] = await pool.query(
    `SELECT p.property_id, p.title, p.price, p.created_at, l.city, l.country
     FROM properties p JOIN locations l ON l.location_id = p.location_id
     WHERE p.status = 'pending_review' ORDER BY p.created_at ASC LIMIT 5`
  );
  const [pendingAgents] = await pool.query(
    `SELECT a.agent_id, a.license_number, a.created_at, u.first_name, u.last_name
     FROM agents a JOIN users u ON u.user_id = a.user_id
     WHERE a.verification_status = 'pending' ORDER BY a.created_at ASC LIMIT 5`
  );
  const [pendingRenewals] = await pool.query(
    `SELECT lr.renewal_id, lr.status, lr.submitted_at, u.first_name, u.last_name
     FROM license_renewals lr JOIN agents a ON a.agent_id = lr.agent_id JOIN users u ON u.user_id = a.user_id
     WHERE lr.status IN ('submitted', 'under_review') ORDER BY lr.submitted_at ASC LIMIT 5`
  );
  const [recentActions] = await pool.query(
    `SELECT al.log_id, al.action_type, al.target_type, al.target_id, al.notes, al.created_at,
            u.first_name AS admin_first_name, u.last_name AS admin_last_name
     FROM admin_action_log al
     JOIN admin_users au ON au.admin_id = al.admin_id
     JOIN users u ON u.user_id = au.user_id
     ORDER BY al.created_at DESC LIMIT 8`
  );

  return {
    users: userStats,
    properties: propertyStats,
    agents: agentStats,
    renewals: renewalStats,
    inquiries: inquiryStats,
    pendingProperties,
    pendingAgents,
    pendingRenewals,
    recentActions,
  };
}

/** Admin property view — every status, unlike the public search which is 'active'-only. */
async function listAllProperties({ status, listingType, search, page = 1, limit = 20 } = {}) {
  const conditions = [];
  const params = {};
  if (status) {
    conditions.push('p.status = :status');
    params.status = status;
  }
  if (listingType) {
    conditions.push('p.listing_type = :listingType');
    params.listingType = listingType;
  }
  if (search) {
    conditions.push('(p.title LIKE :search OR l.city LIKE :search OR l.country LIKE :search)');
    params.search = `%${search}%`;
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const [rows] = await pool.query(
    `SELECT p.property_id, p.title, p.price, p.status, p.listing_type, p.created_at, p.rejection_reason,
            pt.name AS type_name, l.city, l.country,
            u.first_name AS lister_first_name, u.last_name AS lister_last_name
     FROM properties p
     JOIN property_types pt ON pt.type_id = p.type_id
     JOIN locations l ON l.location_id = p.location_id
     JOIN users u ON u.user_id = p.listed_by_user_id
     ${where}
     ORDER BY p.created_at DESC
     LIMIT ${safeLimit} OFFSET ${offset}`,
    params
  );

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM properties p JOIN locations l ON l.location_id = p.location_id ${where}`,
    params
  );
  const total = countRows[0].total;

  return {
    properties: rows,
    pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) || 0 },
  };
}

async function listAllUsers({ role, status, search, page = 1, limit = 20 } = {}) {
  const conditions = [];
  const params = {};
  if (role) {
    conditions.push('role = :role');
    params.role = role;
  }
  if (status) {
    conditions.push('status = :status');
    params.status = status;
  }
  if (search) {
    conditions.push('(first_name LIKE :search OR last_name LIKE :search OR email LIKE :search)');
    params.search = `%${search}%`;
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const [rows] = await pool.query(
    `SELECT user_id, email, role, first_name, last_name, status, created_at
     FROM users
     ${where}
     ORDER BY created_at DESC
     LIMIT ${safeLimit} OFFSET ${offset}`,
    params
  );

  const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM users ${where}`, params);
  const total = countRows[0].total;

  return {
    users: rows,
    pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) || 0 },
  };
}

async function updateUserStatus(userId, status) {
  await pool.query('UPDATE users SET status = :status WHERE user_id = :userId', { userId, status });
}

async function listActionLog({ targetType, page = 1, limit = 30 } = {}) {
  const conditions = [];
  const params = {};
  if (targetType) {
    conditions.push('al.target_type = :targetType');
    params.targetType = targetType;
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 100);
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const [rows] = await pool.query(
    `SELECT al.*, u.first_name AS admin_first_name, u.last_name AS admin_last_name
     FROM admin_action_log al
     JOIN admin_users au ON au.admin_id = al.admin_id
     JOIN users u ON u.user_id = au.user_id
     ${where}
     ORDER BY al.created_at DESC
     LIMIT ${safeLimit} OFFSET ${offset}`,
    params
  );

  const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM admin_action_log al ${where}`, params);
  const total = countRows[0].total;

  return {
    logs: rows,
    pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) || 0 },
  };
}

module.exports = { getDashboardStats, listAllProperties, listAllUsers, updateUserStatus, listActionLog };
