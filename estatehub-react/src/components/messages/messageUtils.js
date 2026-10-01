// src/components/messages/messageUtils.js
// Pure helpers for the Messages page. The API returns DB timestamps as plain
// "YYYY-MM-DD HH:MM:SS" strings (mysql2 dateStrings), which the rest of the
// app (see UserDashboard) parses as local time — we do the same for consistency.

export const MAX_MESSAGE_LENGTH = 5000; // mirrors message.validator.js on the backend

export function parseDbDate(value) {
  if (!value) return null;
  const date = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Whole calendar days from `date` to `now` (0 = today, 1 = yesterday, …). */
function calendarDaysAgo(date, now = new Date()) {
  return Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
}

export function isSameDay(a, b) {
  return calendarDaysAgo(a, b) === 0;
}

export function formatClock(date) {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Compact timestamp for the conversation list: 3:42 PM / Yesterday / Mon / Sep 4. */
export function formatListTimestamp(value) {
  const date = parseDbDate(value);
  if (!date) return '';
  const days = calendarDaysAgo(date);
  if (days <= 0) return formatClock(date); // today (or slightly-in-the-future clock skew)
  if (days === 1) return 'Yesterday';
  if (days < 7) return date.toLocaleDateString(undefined, { weekday: 'short' });
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Day divider label inside a thread: Today / Yesterday / Mon, Sep 14. */
export function formatDayLabel(date) {
  const days = calendarDaysAgo(date);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, sameYear ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fullName(first, last) {
  return [first, last].filter(Boolean).join(' ').trim() || 'Unknown user';
}

export function getInitials(first, last) {
  const letters = [first, last].filter(Boolean).map((part) => part.trim()[0]).filter(Boolean);
  return (letters.join('') || '?').toUpperCase().slice(0, 2);
}

const ROLE_LABELS = { agent: 'Agent', buyer: 'Buyer', admin: 'Admin' };
export function roleLabel(role) {
  return ROLE_LABELS[role] || '';
}

export function formatPrice(value) {
  const num = Number(value);
  if (value === null || value === undefined || Number.isNaN(num)) return '';
  return `$${num.toLocaleString()}`;
}

export function formatPropertyLocation(conversation) {
  return [conversation.property_neighborhood, conversation.property_city].filter(Boolean).join(', ');
}

/** Everything the inbox search box matches against, lower-cased. */
export function conversationSearchText(conversation) {
  return [
    conversation.other_first_name,
    conversation.other_last_name,
    conversation.property_title,
    conversation.property_city,
    conversation.property_neighborhood,
    conversation.last_message_text,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** Parses ?conversation=ID — anything that isn't a positive integer is "no selection". */
export function parseConversationId(value) {
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : null;
}
