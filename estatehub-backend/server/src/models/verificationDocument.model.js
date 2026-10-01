// src/models/verificationDocument.model.js

const { pool } = require('../config/db');

async function createDocument({ agentId, renewalId, documentType, fileUrl }) {
  const [result] = await pool.query(
    `INSERT INTO verification_documents (agent_id, renewal_id, document_type, file_url)
     VALUES (:agentId, :renewalId, :documentType, :fileUrl)`,
    { agentId, renewalId: renewalId || null, documentType, fileUrl }
  );
  return result.insertId;
}

/** Documents uploaded for initial agent verification (not tied to any renewal). */
async function listInitialVerificationDocs(agentId) {
  const [rows] = await pool.query(
    'SELECT * FROM verification_documents WHERE agent_id = :agentId AND renewal_id IS NULL ORDER BY uploaded_at DESC',
    { agentId }
  );
  return rows;
}

/** Documents uploaded as part of a specific license renewal. */
async function listForRenewal(renewalId) {
  const [rows] = await pool.query(
    'SELECT * FROM verification_documents WHERE renewal_id = :renewalId ORDER BY uploaded_at DESC',
    { renewalId }
  );
  return rows;
}

async function findById(documentId) {
  const [rows] = await pool.query(
    'SELECT * FROM verification_documents WHERE document_id = :documentId LIMIT 1',
    { documentId }
  );
  return rows[0] || null;
}

/** Compare-and-set: only a document still 'pending' can be verified. Returns true if applied. */
async function verifyDocument(documentId, reviewedBy) {
  const [result] = await pool.query(
    `UPDATE verification_documents
     SET status = 'verified', reviewed_by = :reviewedBy, reviewed_at = NOW(), rejection_reason = NULL
     WHERE document_id = :documentId AND status = 'pending'`,
    { documentId, reviewedBy }
  );
  return result.affectedRows === 1;
}

/** Compare-and-set: only a document still 'pending' can be rejected. Returns true if applied. */
async function rejectDocument(documentId, reviewedBy, reason) {
  const [result] = await pool.query(
    `UPDATE verification_documents
     SET status = 'rejected', reviewed_by = :reviewedBy, reviewed_at = NOW(), rejection_reason = :reason
     WHERE document_id = :documentId AND status = 'pending'`,
    { documentId, reviewedBy, reason }
  );
  return result.affectedRows === 1;
}

/** Removes the row. Returns true if a row was deleted. (The controller removes the file from disk.) */
async function deleteDocument(documentId) {
  const [result] = await pool.query('DELETE FROM verification_documents WHERE document_id = :documentId', { documentId });
  return result.affectedRows > 0;
}

async function countForAgentInitial(agentId) {
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS cnt FROM verification_documents WHERE agent_id = :agentId AND renewal_id IS NULL',
    { agentId }
  );
  return rows[0].cnt;
}

async function countForRenewal(renewalId) {
  const [rows] = await pool.query('SELECT COUNT(*) AS cnt FROM verification_documents WHERE renewal_id = :renewalId', { renewalId });
  return rows[0].cnt;
}

module.exports = {
  deleteDocument,
  countForAgentInitial,
  countForRenewal,
  createDocument,
  listInitialVerificationDocs,
  listForRenewal,
  findById,
  verifyDocument,
  rejectDocument,
};
