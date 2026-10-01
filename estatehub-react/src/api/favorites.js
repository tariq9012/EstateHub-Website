// src/api/favorites.js

import { api } from './apiClient';

export function listFavorites() {
  return api.get('/favorites');
}

export function addFavorite(propertyId) {
  return api.post(`/favorites/${propertyId}`);
}

export function removeFavorite(propertyId) {
  return api.delete(`/favorites/${propertyId}`);
}