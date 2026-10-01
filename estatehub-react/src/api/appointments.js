// src/api/appointments.js

import { api } from './apiClient';

export function createAppointment(payload) {
  return api.post('/appointments', payload);
}

export function getMyAppointments() {
  return api.get('/appointments/me');
}

export function getAgentAppointments() {
  return api.get('/appointments/agent');
}

export function updateAppointmentStatus(id, status) {
  return api.put(`/appointments/${id}/status`, { status });
}