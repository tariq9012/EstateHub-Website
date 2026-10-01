// src/components/appointments/appointmentUtils.js
// Shared helpers for the Appointments page, the dashboard preview and PropertyDetails.
//
// TIME MODEL: the API returns `scheduled_at` as 'YYYY-MM-DD HH:MM:SS' in UTC (the backend
// stores UTC — see server/src/utils/appointmentRules.js). We convert to the viewer's local
// time here, and send new viewings as full ISO instants (Date#toISOString()).
// Whether an action is allowed is decided by the server (`available_actions`); nothing here
// re-implements the permission rules.

export const ACTIVE_STATUSES = ['requested', 'confirmed'];

export function parseScheduledAt(value) {
  if (!value) return null;
  const date = new Date(`${String(value).replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getStart(appt) {
  return parseScheduledAt(appt.scheduled_at);
}

export function getEnd(appt) {
  const start = getStart(appt);
  return start ? new Date(start.getTime() + (Number(appt.duration_minutes) || 30) * 60000) : null;
}

const isActive = (appt) => ACTIVE_STATUSES.includes(appt.status);

/** Active (requested/confirmed) and not started yet — the same definition the dashboard has always used. */
export function isUpcoming(appt, now = Date.now()) {
  const start = getStart(appt);
  return isActive(appt) && start !== null && start.getTime() >= now;
}

/** Still active but its time has passed without being resolved. */
export function isOverdue(appt, now = Date.now()) {
  const start = getStart(appt);
  return isActive(appt) && start !== null && start.getTime() < now;
}

export const TAB_KEYS = ['upcoming', 'pending', 'completed', 'cancelled', 'all', 'needs_update'];

export function matchesTab(appt, tab, now = Date.now()) {
  switch (tab) {
    case 'upcoming':
      return isUpcoming(appt, now);
    case 'pending':
      return appt.status === 'requested' && isUpcoming(appt, now);
    case 'completed':
      return appt.status === 'completed';
    case 'cancelled': // cancelled viewings and no-shows: both ended without a viewing taking place
      return appt.status === 'cancelled' || appt.status === 'no_show';
    case 'needs_update':
      return isOverdue(appt, now);
    default:
      return true;
  }
}

export function countByTab(appointments, now = Date.now()) {
  const counts = {};
  TAB_KEYS.forEach((tab) => {
    counts[tab] = appointments.filter((a) => matchesTab(a, tab, now)).length;
  });
  return counts;
}

/** Soonest first for forward-looking tabs; most recent first for history; "all" = upcoming then history. */
export function sortForTab(list, tab, now = Date.now()) {
  const byTime = (a, b) => getStart(a) - getStart(b);
  const asc = [...list].sort(byTime);
  if (tab === 'upcoming' || tab === 'pending') return asc;
  if (tab === 'all') {
    const upcoming = asc.filter((a) => isUpcoming(a, now));
    const rest = asc.filter((a) => !isUpcoming(a, now)).reverse();
    return [...upcoming, ...rest];
  }
  return asc.reverse();
}

export const STATUS_META = {
  requested: { label: 'Requested', className: 'bg-secondary-container text-on-secondary-container' },
  confirmed: { label: 'Confirmed', className: 'bg-status-success/10 text-status-success' },
  completed: { label: 'Completed', className: 'bg-surface-container text-on-surface-variant' },
  cancelled: { label: 'Cancelled', className: 'bg-error-container text-on-error-container' },
  no_show: { label: 'No-show', className: 'bg-error-container text-on-error-container' },
};

// Order = button order (primary actions first).
export const ACTION_ORDER = ['confirmed', 'completed', 'no_show', 'cancelled'];

export const ACTION_META = {
  confirmed: { success: 'Viewing confirmed.', busy: 'Confirming…' },
  completed: { success: 'Viewing marked as completed.', busy: 'Saving…' },
  no_show: { success: 'Viewing marked as a no-show.', busy: 'Saving…' },
  cancelled: { success: 'Viewing cancelled.', busy: 'Cancelling…' },
};

export function actionLabel(target, mode, appt) {
  if (target === 'confirmed') return 'Confirm';
  if (target === 'completed') return 'Mark completed';
  if (target === 'no_show') return 'Mark no-show';
  if (mode === 'agent' && appt.status === 'requested') return 'Decline request';
  return 'Cancel viewing';
}

/** Destructive / hard-to-undo actions get an inline "are you sure?" step. */
export function needsConfirmation(target) {
  return target === 'cancelled' || target === 'no_show';
}

export function confirmCopy(target, mode) {
  if (target === 'no_show') return { question: 'Mark this viewing as a no-show?', detail: 'This cannot be changed afterwards.', yes: 'Yes, mark no-show', no: 'Keep as is' };
  if (mode === 'agent') return { question: 'Cancel this viewing?', detail: 'The buyer will be notified. This cannot be undone.', yes: 'Yes, cancel viewing', no: 'Keep viewing' };
  return { question: 'Cancel this viewing?', detail: 'The agent will be notified. This cannot be undone.', yes: 'Yes, cancel viewing', no: 'Keep viewing' };
}

// ---------------------------------------------------------------- formatting

export function formatLongDate(date) {
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatClock(date) {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatTimeRange(appt) {
  const start = getStart(appt);
  const end = getEnd(appt);
  if (!start || !end) return '';
  return `${formatClock(start)} – ${formatClock(end)}`;
}

/** Short viewer-timezone name, e.g. "GMT+5" / "PDT". */
export function timezoneLabel(date) {
  try {
    const part = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(date).find((p) => p.type === 'timeZoneName');
    return part ? part.value : '';
  } catch (err) {
    return '';
  }
}

export function formatDuration(minutes) {
  const m = Number(minutes) || 0;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

/** "Sat, Sep 26, 10:00 AM" — compact, for the dashboard preview and success messages. */
export function formatViewingDateTime(value) {
  const date = value instanceof Date ? value : parseScheduledAt(value);
  if (!date) return '';
  const day = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return `${day}, ${formatClock(date)}`;
}

export function fullName(first, last, fallback = 'Unknown') {
  return [first, last].filter(Boolean).join(' ').trim() || fallback;
}

export function propertyLocation(appt) {
  return [appt.property_neighborhood, appt.property_city].filter(Boolean).join(', ');
}
