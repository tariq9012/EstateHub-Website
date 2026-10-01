// src/api/inquiries.js

import { api } from './apiClient';

export function createInquiry(payload) {
  return api.post('/inquiries', payload);
}

export function getMyInquiries() {
  return api.get('/inquiries/me');
}

export function getReceivedInquiries() {
  return api.get('/inquiries/received');
}

export function updateInquiryStatus(id, status) {
  return api.put(`/inquiries/${id}/status`, { status });
}