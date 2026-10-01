// src/api/agents.js

import { api } from './apiClient';

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

/** GET /api/agents — public search/filter/paginate */
export function listAgents(params = {}) {
  return api.get(`/agents${toQueryString(params)}`);
}

/** GET /api/agents/:id — public agent profile + reviews */
export function getAgent(id) {
  return api.get(`/agents/${id}`);
}

/** POST /api/agents/:id/reviews — auth required */
export function createAgentReview(id, payload) {
  return api.post(`/agents/${id}/reviews`, payload);
}

/** GET /api/agents/me/listings — agent only; every property assigned to the signed-in agent (JWT-derived). */
export function getMyListings() {
  return api.get('/agents/me/listings');
}

/** PUT /api/agents/me/profile — agent only. */
export function updateMyAgentProfile(payload) {
  return api.put('/agents/me/profile', payload);
}
