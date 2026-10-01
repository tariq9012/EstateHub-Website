// src/api/licenseRenewals.js
// Agent-facing license renewal calls. Ownership is enforced server-side from the JWT.

import { api } from './apiClient';

/** POST /api/license-renewals — start a renewal (409 + details.renewalId if one is already open). */
export function createRenewal() {
  return api.post('/license-renewals', {});
}

/** GET /api/license-renewals/me — the agent's renewals, each with its own `documents`. */
export function getMyRenewals() {
  return api.get('/license-renewals/me');
}

/** POST /api/license-renewals/:id/documents — multipart: "document" + "documentType". */
export function uploadRenewalDocument(renewalId, formData) {
  return api.upload(`/license-renewals/${renewalId}/documents`, formData);
}

/** DELETE /api/license-renewals/:id/documents/:documentId */
export function deleteRenewalDocument(renewalId, documentId) {
  return api.delete(`/license-renewals/${renewalId}/documents/${documentId}`);
}

/** PUT /api/license-renewals/:id/submit */
export function submitRenewal(renewalId) {
  return api.put(`/license-renewals/${renewalId}/submit`);
}

// --- Admin (super_admin / moderator can act; support can only view — enforced on the backend) ---

/** GET /api/license-renewals?status= — every renewal (with its documents attached), any status. */
export function getAllRenewals(status) {
  return api.get(`/license-renewals${status ? `?status=${encodeURIComponent(status)}` : ''}`);
}

/** PUT /api/license-renewals/:id/under-review — only from 'submitted'. */
export function moveRenewalToUnderReview(renewalId) {
  return api.put(`/license-renewals/${renewalId}/under-review`);
}

/** PUT /api/license-renewals/:id/approve — body: { newExpiryDate }. Only from 'under_review'. */
export function approveRenewal(renewalId, newExpiryDate) {
  return api.put(`/license-renewals/${renewalId}/approve`, { newExpiryDate });
}

/** PUT /api/license-renewals/:id/reject — only from 'under_review'. */
export function rejectRenewal(renewalId) {
  return api.put(`/license-renewals/${renewalId}/reject`);
}

/** PUT /api/license-renewals/:id/request-documents — only from 'under_review'. */
export function requestMoreRenewalDocuments(renewalId) {
  return api.put(`/license-renewals/${renewalId}/request-documents`);
}
