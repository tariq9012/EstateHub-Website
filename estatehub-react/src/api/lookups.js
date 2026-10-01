// src/api/lookups.js

import { api } from './apiClient';

export function getPropertyTypes() {
  return api.get('/lookups/property-types');
}

export function getAmenities() {
  return api.get('/lookups/amenities');
}

export function getLocations() {
  return api.get('/lookups/locations');
}