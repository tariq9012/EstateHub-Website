// src/api/conversations.js

import { api } from './apiClient';

export function listConversations() {
  return api.get('/conversations');
}

export function getConversationMessages(id) {
  return api.get(`/conversations/${id}/messages`);
}

export function sendMessage(id, messageText) {
  return api.post(`/conversations/${id}/messages`, { messageText });
}