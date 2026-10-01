// src/api/admin.js
// Admin-only calls. Every endpoint here requires an authenticated admin JWT; mutating endpoints
// are further gated server-side by permission_level (see backend requirePermission.js).

import { api } from './apiClient';

function toQueryString(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, value);
  });
  const qs = query.toString();
  return qs ? `?${qs}` : '';
}

/** GET /api/admin/dashboard-stats — real counts + small previews, no fabricated metrics. */
export function getDashboardStats() {
  return api.get('/admin/dashboard-stats');
}

/** GET /api/admin/properties — every status (unlike the public search, which is active-only). */
export function getAdminProperties(params = {}) {
  return api.get(`/admin/properties${toQueryString(params)}`);
}

/** GET /api/admin/users */
export function getAdminUsers(params = {}) {
  return api.get(`/admin/users${toQueryString(params)}`);
}

/** PUT /api/admin/users/:id/status — super_admin only on the backend. Body: { status }. */
export function updateUserStatus(userId, status) {
  return api.put(`/admin/users/${userId}/status`, { status });
}

/** GET /api/admin/action-log */
export function getActionLog(params = {}) {
  return api.get(`/admin/action-log${toQueryString(params)}`);
}

/** GET /api/admin/notification-settings */
export function getNotificationSettings() {
  return api.get('/admin/notification-settings');
}

/** PUT /api/admin/notification-settings/:eventKey — super_admin only. Body: { emailEnabled, smsEnabled }. */
export function updateNotificationSetting(eventKey, payload) {
  return api.put(`/admin/notification-settings/${eventKey}`, payload);
}
