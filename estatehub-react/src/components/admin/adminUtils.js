// src/components/admin/adminUtils.js
// Status metadata specific to the Admin portal. Date/price/name formatting and the
// property/verification/document/renewal status maps already live in components/agent/agentUtils —
// reused here rather than duplicated (they aren't agent-specific, just first defined there).

export const USER_STATUS = {
  active: { label: 'Active', tone: 'success' },
  suspended: { label: 'Suspended', tone: 'error' },
  deactivated: { label: 'Deactivated', tone: 'neutral' },
};

export const ROLE_LABELS = {
  buyer: 'Buyer',
  agent: 'Agent',
  admin: 'Admin',
};

export const PERMISSION_LABELS = {
  super_admin: 'Super Admin',
  moderator: 'Moderator',
  support: 'Support',
};

/** Human label for an admin_action_log.action_type value, e.g. 'property_approved' -> 'Property approved'. */
export function formatActionType(actionType) {
  if (!actionType) return '—';
  return actionType.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase());
}
