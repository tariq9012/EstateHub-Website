// src/components/agent/agentNav.js
// Single source of truth for the Agent portal navigation (desktop sidebar + mobile drawer).

export const AGENT_HOME = '/agent-dashboard';

export const AGENT_NAV = [
  { key: 'dashboard', to: '/agent-dashboard', icon: 'dashboard', label: 'Dashboard' },
  { key: 'listings', to: '/my-listings', icon: 'sell', label: 'My Listings' },
  { key: 'add', to: '/list-your-property', icon: 'add_home', label: 'Add Property' },
  { key: 'inquiries', to: '/agent-inquiries', icon: 'inbox', label: 'Inquiries' },
  { key: 'messages', to: '/messages', icon: 'mail', label: 'Messages' },
  { key: 'appointments', to: '/appointments', icon: 'calendar_month', label: 'Appointments' },
  { key: 'reviews', to: '/agent-reviews', icon: 'star', label: 'Reviews' },
  { key: 'verification', to: '/agent-verification', icon: 'verified_user', label: 'Verification' },
  { key: 'renewal', to: '/agent-certification-tracking', icon: 'workspace_premium', label: 'License Renewal' },
  { key: 'notifications', to: '/agent-notifications', icon: 'notifications', label: 'Notifications' },
  { key: 'settings', to: '/agent-settings', icon: 'person', label: 'Profile & Settings' },
];
