// src/api/recentlyViewed.js

import { api } from './apiClient';

export function listRecentlyViewed(limit) {
  return api.get(`/recently-viewed${limit ? `?limit=${limit}` : ''}`);
}