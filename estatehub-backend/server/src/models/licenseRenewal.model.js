// src/models/licenseRenewal.model.js

const { pool } = require('../config/db');

const RENEWAL_STATUSES = ['draft', 'documents_pending', 'submitted', 'under_review', 'missing_documents', 'approved', 'rejected'];

async function create(agentId, currentLicenseExpiry) {
  const result = await pool.query(
    `INSERT INTO license_renewals (agent_id, current_license_expiry, status)
     VALUES (:agentId, :currentLicenseExpiry, 'draft') RETURNING renewal_id`,
    { agentId, currentLicenseExpiry }
  );
  return result.rows[0].renewal_id;
}

async function findById(renewalId) {
  const { rows } = await pool.query('SELECT * FROM license_renewals WHERE renewal_id = :renewalId LIMIT 1', {
    renewalId,
  });
  return rows[0] || null;
}

async function listForAgent(agentId) {
  const { rows } = await pool.query(
    'SELECT * FROM license_renewals WHERE agent_id = :agentId ORDER BY created_at DESC',
    { agentId }
  );
  return rows;
}

async function listAll({ status } = {}) {
  const conditions = [];
  const params = {};
  if (status) {
    conditions.push('lr.status = :status');
    params.status = status;
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT lr.*, a.license_number, u.first_name, u.last_name, u.email
     FROM license_renewals lr
     JOIN agents a ON a.agent_id = lr.agent_id
     JOIN users u ON u.user_id = a.user_id
     ${where}
     ORDER BY lr.created_at DESC`,
    params
  );
  return rows;
}

/** Called the moment a document gets attached while the renewal is still 'draft'. */
async function markDocumentsPending(renewalId) {
  await pool.query(
    `UPDATE license_renewals SET status = 'documents_pending' WHERE renewal_id = :renewalId AND status = 'draft'`,
    { renewalId }
  );
}

/** The agent's renewal that is still in progress (not approved/rejected), newest first, or null. */
async function findOpenByAgent(agentId) {
  const { rows } = await pool.query(
    `SELECT * FROM license_renewals
     WHERE agent_id = :agentId AND status IN ('draft','documents_pending','submitted','under_review','missing_documents')
     ORDER BY created_at DESC LIMIT 1`,
    { agentId }
  );
  return rows[0] || null;
}

/**
 * Compare-and-set submit: only moves the renewal to 'submitted' if it is STILL in one of
 * `allowedStatuses`, so a renewal an admin already approved/rejected/is reviewing can never be
 * pushed back to 'submitted' by a stale or replayed request. Returns true if it changed.
 */
async function submitIfStatus(renewalId, allowedStatuses) {
  // Interpolated from a fixed enum allow-list (never user input) — avoids relying on array expansion in IN (...).
  const list = allowedStatuses.filter((s) => RENEWAL_STATUSES.includes(s)).map((s) => `'${s}'`).join(', ');
  if (!list) return false;
  const result = await pool.query(
    `UPDATE license_renewals SET status = 'submitted', submitted_at = NOW()
     WHERE renewal_id = :renewalId AND status IN (${list})`,
    { renewalId }
  );
  return result.rowCount === 1;
}

async function submit(renewalId) {
  await pool.query(
    `UPDATE license_renewals SET status = 'submitted', submitted_at = NOW() WHERE renewal_id = :renewalId`,
    { renewalId }
  );
}

/**
 * Compare-and-set: admin starts reviewing a renewal. Only from 'submitted'. Returns true if applied.
 */
async function moveToUnderReview(renewalId, reviewedBy) {
  const result = await pool.query(
    `UPDATE license_renewals SET status = 'under_review', reviewed_by = :reviewedBy
     WHERE renewal_id = :renewalId AND status = 'submitted'`,
    { renewalId, reviewedBy }
  );
  return result.rowCount === 1;
}

/**
 * Compare-and-set: a renewal can only be approved while 'under_review'. This mirrors the state
 * machine in agentPortalRules.js and stops a stale/replayed/forged request from approving a
 * renewal that was already decided (or never entered review). Returns true if applied.
 */
async function approve(renewalId, reviewedBy, newExpiryDate) {
  const result = await pool.query(
    `UPDATE license_renewals
     SET status = 'approved', reviewed_by = :reviewedBy, reviewed_at = NOW(), new_expiry_date = :newExpiryDate
     WHERE renewal_id = :renewalId AND status = 'under_review'`,
    { renewalId, reviewedBy, newExpiryDate }
  );
  return result.rowCount === 1;
}

/** Compare-and-set: only from 'under_review'. Returns true if applied. */
async function reject(renewalId, reviewedBy) {
  const result = await pool.query(
    `UPDATE license_renewals SET status = 'rejected', reviewed_by = :reviewedBy, reviewed_at = NOW()
     WHERE renewal_id = :renewalId AND status = 'under_review'`,
    { renewalId, reviewedBy }
  );
  return result.rowCount === 1;
}

/** Compare-and-set: only from 'under_review'. Returns true if applied. */
async function requestMoreDocuments(renewalId, reviewedBy) {
  const result = await pool.query(
    `UPDATE license_renewals SET status = 'missing_documents', reviewed_by = :reviewedBy
     WHERE renewal_id = :renewalId AND status = 'under_review'`,
    { renewalId, reviewedBy }
  );
  return result.rowCount === 1;
}

module.exports = {
  create,
  findById,
  listForAgent,
  listAll,
  markDocumentsPending,
  findOpenByAgent,
  submitIfStatus,
  submit,
  moveToUnderReview,
  approve,
  reject,
  requestMoreDocuments,
};
