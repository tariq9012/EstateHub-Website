// src/api/notifications.js

import { api } from './apiClient';

export function listNotifications(params = {}) {
  const query = new URLSearchParams();
  if (params.unreadOnly) query.set('unreadOnly', 'true');
  if (params.limit) query.set('limit', params.limit);
  const qs = query.toString();
  return api.get(`/notifications${qs ? `?${qs}` : ''}`);
}

export function markNotificationRead(id) {
  return api.put(`/notifications/${id}/read`);
}

export function markAllNotificationsRead() {
  return api.put('/notifications/read-all');
}