// src/api/properties.js

import { api } from './apiClient';
import { uploadImages } from './uploads';

function toQueryString(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, value);
    }
  });
  const qs = query.toString();
  return qs ? `?${qs}` : '';
}

/** GET /api/properties — public search/filter/paginate (always 'active' listings). */
export function searchProperties(params = {}) {
  return api.get(`/properties${toQueryString(params)}`);
}

/** GET /api/properties/:id */
export function getProperty(id) {
  return api.get(`/properties/${id}`);
}

/** GET /api/properties/mine — auth required */
export function getMyProperties() {
  return api.get('/properties/mine');
}

/** POST /api/properties — auth required */
export function createProperty(payload) {
  return api.post('/properties', payload);
}

/** POST /api/properties/:id/images — auth required, multipart form-data (field name "images") */
export function addPropertyImages(id, formData) {
  return uploadImages(`/properties/${id}/images`, formData);
}

/** PUT /api/properties/:id/amenities — auth required. Body: { amenityIds: number[] } */
export function setPropertyAmenities(id, amenityIds) {
  return api.put(`/properties/${id}/amenities`, { amenityIds });
}

/** GET /api/properties/:id/reviews — public */
export function getPropertyReviews(id) {
  return api.get(`/properties/${id}/reviews`);
}

/** POST /api/properties/:id/reviews — auth required */
export function createPropertyReview(id, payload) {
  return api.post(`/properties/${id}/reviews`, payload);
}

/** PUT /api/properties/:id — auth required */
export function updateProperty(id, payload) {
  return api.put(`/properties/${id}`, payload);
}

/** DELETE /api/properties/:id — auth required (soft-archive) */
export function archiveProperty(id) {
  return api.delete(`/properties/${id}`);
}

/** DELETE /api/properties/:id/images/:imageId — removes the row and the file; returns the remaining images. */
export function deletePropertyImage(id, imageId) {
  return api.delete(`/properties/${id}/images/${imageId}`);
}

/** PUT /api/properties/:id/images/:imageId/primary */
export function setPrimaryPropertyImage(id, imageId) {
  return api.put(`/properties/${id}/images/${imageId}/primary`);
}

// --- Admin moderation (super_admin / moderator only on the backend) ---

/** PUT /api/properties/:id/approve — admin only. Only applies while the listing is pending_review. */
export function approveProperty(id) {
  return api.put(`/properties/${id}/approve`);
}

/** PUT /api/properties/:id/reject — admin only. Body: { reason }. Only while pending_review. */
export function rejectProperty(id, reason) {
  return api.put(`/properties/${id}/reject`, { reason });
}
