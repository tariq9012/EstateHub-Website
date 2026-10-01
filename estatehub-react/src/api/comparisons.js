// src/api/comparisons.js

import { api } from './apiClient';

export function getComparison() {
  return api.get('/comparisons');
}

export function addToComparison(propertyId) {
  return api.post(`/comparisons/items/${propertyId}`);
}

export function removeFromComparison(propertyId) {
  return api.delete(`/comparisons/items/${propertyId}`);
}