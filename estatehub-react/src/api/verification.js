// src/api/verification.js
// Agent-facing verification calls. The agent is always resolved from the JWT on the server.

import { api } from './apiClient';

/** GET /api/verification/me — status, license info, own documents, canSubmit/missing flags. */
export function getMyVerification() {
  return api.get('/verification/me');
}

/** POST /api/verification/documents — multipart: field "document" + "documentType". */
export function uploadVerificationDocument(formData) {
  return api.upload('/verification/documents', formData);
}

/** DELETE /api/verification/documents/:id — own initial-verification document. */
export function deleteVerificationDocument(documentId) {
  return api.delete(`/verification/documents/${documentId}`);
}

/** POST /api/verification/submit — submit own verification for admin review. */
export function submitMyVerification() {
  return api.post('/verification/submit', {});
}

// --- Admin (super_admin / moderator can act; support can only view — enforced on the backend) ---

/** GET /api/verification/queue?status= — defaults to 'pending' on the backend. */
export function getVerificationQueue(status = 'pending') {
  return api.get(`/verification/queue?status=${encodeURIComponent(status)}`);
}

/** GET /api/verification/:agentId — full agent profile + their initial verification documents. */
export function getAgentVerificationDetail(agentId) {
  return api.get(`/verification/${agentId}`);
}

/** PUT /api/verification/documents/:documentId/verify */
export function verifyDocument(documentId) {
  return api.put(`/verification/documents/${documentId}/verify`);
}

/** PUT /api/verification/documents/:documentId/reject — body: { reason } */
export function rejectDocument(documentId, reason) {
  return api.put(`/verification/documents/${documentId}/reject`, { reason });
}

/** PUT /api/verification/:agentId/verify */
export function verifyAgent(agentId) {
  return api.put(`/verification/${agentId}/verify`);
}

/** PUT /api/verification/:agentId/reject */
export function rejectAgent(agentId) {
  return api.put(`/verification/${agentId}/reject`);
}

/**
 * GET /api/verification/documents/:documentId/file — returns a blob object URL for previewing or
 * downloading a document (owning agent, or any admin). Caller must URL.revokeObjectURL() when done.
 */
export function getDocumentFileUrl(documentId) {
  return api.getBlobUrl(`/verification/documents/${documentId}/file`);
}
