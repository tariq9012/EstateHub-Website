// src/components/agent/agentUtils.js
// Formatting + status metadata shared by the Agent portal pages.

/** Parses a DATE column ('YYYY-MM-DD', possibly with a time part) as a LOCAL calendar date (no timezone shift). */
export function parseDateOnly(value) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function formatDate(value) {
  const date = parseDateOnly(value);
  return date ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
}

/** TIMESTAMP columns ('YYYY-MM-DD HH:MM:SS'): parsed the same way the rest of the app does (as local time). */
export function parseTimestamp(value) {
  if (!value) return null;
  const date = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatTimestamp(value) {
  const date = parseTimestamp(value);
  return date ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
}

export function timeAgo(value) {
  const date = parseTimestamp(value);
  if (!date) return '';
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatTimestamp(value);
}

export function formatPrice(value) {
  const num = Number(value);
  return Number.isNaN(num) ? '—' : `$${num.toLocaleString()}`;
}

export function fullName(first, last, fallback = 'Unknown') {
  return [first, last].filter(Boolean).join(' ').trim() || fallback;
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------- license countdown

export const EXPIRING_SOON_DAYS = 60;

/** Real countdown from the stored expiry date. `state` is 'unknown' | 'expired' | 'expiring' | 'valid'. */
export function licenseCountdown(expiry, now = new Date()) {
  const date = parseDateOnly(expiry);
  if (!date) return { state: 'unknown', days: null, date: null };
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((date - today) / 86400000);
  if (days < 0) return { state: 'expired', days, date };
  if (days <= EXPIRING_SOON_DAYS) return { state: 'expiring', days, date };
  return { state: 'valid', days, date };
}

// ---------------------------------------------------------------- status metadata

const TONES = {
  success: 'bg-status-success/10 text-status-success',
  warning: 'bg-secondary-container text-on-secondary-container',
  error: 'bg-error-container text-on-error-container',
  neutral: 'bg-surface-container text-on-surface-variant',
};
export const toneClass = (tone) => TONES[tone] || TONES.neutral;

export const PROPERTY_STATUS = {
  draft: { label: 'Draft', tone: 'neutral' },
  pending_review: { label: 'Pending review', tone: 'warning' },
  active: { label: 'Active', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'error' },
  under_contract: { label: 'Under contract', tone: 'warning' },
  sold: { label: 'Sold', tone: 'neutral' },
  archived: { label: 'Archived', tone: 'neutral' },
};

export const VERIFICATION_STATUS = {
  unverified: { label: 'Not submitted', tone: 'neutral' },
  pending: { label: 'In review', tone: 'warning' },
  verified: { label: 'Verified', tone: 'success' },
  rejected: { label: 'Not approved', tone: 'error' },
};

export const DOCUMENT_STATUS = {
  pending: { label: 'Pending review', tone: 'warning' },
  verified: { label: 'Verified', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'error' },
};

export const RENEWAL_STATUS = {
  draft: { label: 'Draft', tone: 'neutral' },
  documents_pending: { label: 'Documents added', tone: 'neutral' },
  submitted: { label: 'Submitted', tone: 'warning' },
  under_review: { label: 'Under review', tone: 'warning' },
  missing_documents: { label: 'Action required', tone: 'error' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'error' },
};

export const INQUIRY_STATUS = {
  new: { label: 'New', tone: 'warning' },
  contacted: { label: 'Contacted', tone: 'success' },
  closed: { label: 'Closed', tone: 'neutral' },
};

export const DOCUMENT_TYPE_LABELS = {
  license: 'Real estate license',
  insurance: 'Professional insurance',
  certification: 'Certification',
  id_proof: 'Government-issued ID',
  other: 'Other document',
};

/** Statuses of a renewal the agent is still working on (mirrors the backend rule; the API is authoritative). */
export const RENEWAL_AGENT_EDITABLE = ['draft', 'documents_pending', 'missing_documents'];
export const RENEWAL_OPEN = ['draft', 'documents_pending', 'submitted', 'under_review', 'missing_documents'];
