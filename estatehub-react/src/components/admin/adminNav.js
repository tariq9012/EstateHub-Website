// src/components/admin/adminNav.js
// Single source of truth for the Admin portal navigation (desktop sidebar + mobile drawer).

export const ADMIN_HOME = '/admin-dashboard';

export const ADMIN_NAV = [
  { key: 'dashboard', to: '/admin-dashboard', icon: 'dashboard', label: 'Dashboard' },
  { key: 'properties', to: '/manage-properties', icon: 'apartment', label: 'Properties' },
  { key: 'users', to: '/manage-users', icon: 'group', label: 'Users' },
  { key: 'verification', to: '/agent-verification-queue', icon: 'verified_user', label: 'Agent Verification' },
  { key: 'renewals', to: '/admin-review-queue', icon: 'badge', label: 'License Renewals' },
  { key: 'settings', to: '/notification-settings', icon: 'notifications', label: 'Notification Settings' },
  { key: 'auditlog', to: '/admin-audit-log', icon: 'history', label: 'Audit Log' },
];
