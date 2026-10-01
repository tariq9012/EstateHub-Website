// src/api/users.js

import { api } from './apiClient';

export function getMyProfile() {
  return api.get('/users/me/profile');
}

export function updateMyProfile(payload) {
  return api.put('/users/me/profile', payload);
}

export function getMyNotificationPreferences() {
  return api.get('/users/me/notification-preferences');
}

export function updateMyNotificationPreferences(payload) {
  return api.put('/users/me/notification-preferences', payload);
}