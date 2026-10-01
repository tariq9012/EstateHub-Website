// src/components/agent/notificationLinks.js
// Where a notification should take the agent (based on the type/related entity the backend emits).

export function notificationTarget(n) {
  switch (n.type) {
    case 'message':
      return n.related_entity_type === 'conversation' && n.related_entity_id ? `/messages?conversation=${n.related_entity_id}` : '/messages';
    case 'inquiry':
      return '/agent-inquiries';
    case 'appointment':
    case 'appointment_status':
      return '/appointments';
    case 'property_approved':
    case 'property_rejected':
      return '/my-listings';
    case 'agent_verified':
    case 'agent_verification_rejected':
    case 'document_rejected':
      return '/agent-verification';
    case 'renewal_approved':
      return '/renewal-status-tracker';
    case 'renewal_rejected':
      return '/renewal-status-tracker';
    case 'renewal_missing_documents':
      return '/resolve-missing-documents';
    default:
      return null;
  }
}

export const NOTIFICATION_ICONS = {
  message: 'mail',
  inquiry: 'inbox',
  appointment: 'calendar_month',
  appointment_status: 'event_available',
  property_approved: 'check_circle',
  property_rejected: 'report',
  agent_verified: 'verified',
  agent_verification_rejected: 'gpp_bad',
  document_rejected: 'description',
  renewal_approved: 'workspace_premium',
  renewal_rejected: 'workspace_premium',
  renewal_missing_documents: 'error',
  account_status: 'manage_accounts',
};
