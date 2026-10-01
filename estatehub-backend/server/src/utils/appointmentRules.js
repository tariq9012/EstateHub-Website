// src/utils/appointmentRules.js
//
// Single source of truth for appointment business rules. Pure functions only
// (no DB, no Express) so they can be unit-tested and reused by the controller
// and by the model.
//
// TIME MODEL: `appointments.scheduled_at` is a DATETIME with no timezone, so we
// fix the convention here: it is always stored as UTC. Clients send an ISO-8601
// instant WITH an explicit offset (e.g. 2026-09-25T10:00:00Z); the API returns the
// stored 'YYYY-MM-DD HH:MM:SS' string, which is UTC (see fromMysqlUtc()).

const STATUSES = Object.freeze(['requested', 'confirmed', 'completed', 'cancelled', 'no_show']);
const ACTIVE_STATUSES = Object.freeze(['requested', 'confirmed']); // hold the agent's calendar
const TERMINAL_STATUSES = Object.freeze(['completed', 'cancelled', 'no_show']);

const DEFAULT_DURATION_MINUTES = 30;
const MIN_DURATION_MINUTES = 10;
const MAX_DURATION_MINUTES = 480;
const MAX_ADVANCE_DAYS = 365; // sanity cap so nobody can park a slot years ahead

const MINUTE_MS = 60 * 1000;

/** Thrown by the model when a booking clashes; the controller turns it into HTTP 409. */
class AppointmentConflictError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AppointmentConflictError';
    this.code = code;
    this.statusCode = 409;
  }
}

// ---------------------------------------------------------------- time helpers

// ISO-8601 date-time that MUST carry an explicit offset ("Z" or "+05:00").
const OFFSET_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;

/** Parses a client-supplied instant. Returns a Date (floored to the minute) or null. */
function parseScheduledAt(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!OFFSET_DATETIME_RE.test(text)) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(Math.floor(date.getTime() / MINUTE_MS) * MINUTE_MS);
}

/** Date -> 'YYYY-MM-DD HH:MM:SS' (UTC), the format stored in DATETIME columns. */
function toMysqlUtc(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/** 'YYYY-MM-DD HH:MM:SS' (UTC, as returned by mysql2 dateStrings) -> Date. */
function fromMysqlUtc(value) {
  if (value instanceof Date) return value;
  return new Date(`${String(value).replace(' ', 'T')}Z`);
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * MINUTE_MS);
}

/** Two half-open intervals [start, start+duration) overlap. Back-to-back viewings do not. */
function intervalsOverlap(aStart, aDurationMinutes, bStart, bDurationMinutes) {
  const aEnd = addMinutes(aStart, aDurationMinutes).getTime();
  const bEnd = addMinutes(bStart, bDurationMinutes).getTime();
  return aStart.getTime() < bEnd && bStart.getTime() < aEnd;
}

/**
 * Validates the schedule of a NEW viewing request.
 * Returns { ok: true, start, durationMinutes } or { ok: false, httpStatus, code, message }.
 */
function validateNewSchedule({ scheduledAt, durationMinutes }, now = new Date()) {
  const start = parseScheduledAt(scheduledAt);
  if (!start) {
    return {
      ok: false,
      httpStatus: 422,
      code: 'INVALID_DATETIME',
      message: 'Please choose a valid date and time for the viewing.',
    };
  }
  if (start.getTime() <= now.getTime()) {
    return {
      ok: false,
      httpStatus: 422,
      code: 'PAST_DATETIME',
      message: 'Viewings must be scheduled for a future date and time.',
    };
  }
  if (start.getTime() > now.getTime() + MAX_ADVANCE_DAYS * 24 * 60 * MINUTE_MS) {
    return {
      ok: false,
      httpStatus: 422,
      code: 'TOO_FAR_AHEAD',
      message: 'Viewings can be scheduled up to 12 months in advance.',
    };
  }

  let duration = DEFAULT_DURATION_MINUTES;
  if (durationMinutes !== undefined && durationMinutes !== null && durationMinutes !== '') {
    duration = Number(durationMinutes);
    if (!Number.isInteger(duration) || duration < MIN_DURATION_MINUTES || duration > MAX_DURATION_MINUTES) {
      return {
        ok: false,
        httpStatus: 422,
        code: 'INVALID_DURATION',
        message: `Duration must be between ${MIN_DURATION_MINUTES} and ${MAX_DURATION_MINUTES} minutes.`,
      };
    }
  }
  return { ok: true, start, durationMinutes: duration };
}

// ------------------------------------------------------- roles & transitions

/**
 * Who is this user, relative to THIS appointment? Derived only from the JWT
 * identity and the stored row — never from anything the client claims.
 *
 * Least privilege wins: if someone is both the requester and the assigned agent
 * (only possible with legacy data), they are treated as the buyer, so they can
 * never confirm or complete their own request.
 *
 * @param {object} appointment  row with user_id and agent_id
 * @param {{userId:number, role:string}} user  from req.user (JWT)
 * @param {object|null} ownAgent  the agents row belonging to that user, if any
 */
function getViewerRole(appointment, user, ownAgent) {
  if (!appointment || !user) return null;
  if (appointment.user_id === user.userId) return 'buyer';
  if (ownAgent && appointment.agent_id === ownAgent.agent_id) return 'agent';
  if (user.role === 'admin') return 'admin';
  return null;
}

// from -> to -> { by: roles allowed, time: rule }
//   time rules: 'future'  = the viewing must not have started yet
//               'started' = the viewing start time must have passed
//               'any'     = no time restriction
const TRANSITIONS = {
  requested: {
    confirmed: { by: ['agent', 'admin'], time: { agent: 'future', admin: 'future' } },
    // Anyone involved may cancel a request; only staff may close a stale (past) one.
    cancelled: { by: ['buyer', 'agent', 'admin'], time: { buyer: 'future', agent: 'any', admin: 'any' } },
  },
  confirmed: {
    completed: { by: ['agent', 'admin'], time: { agent: 'started', admin: 'started' } },
    no_show: { by: ['agent', 'admin'], time: { agent: 'started', admin: 'started' } },
    cancelled: { by: ['buyer', 'agent', 'admin'], time: { buyer: 'future', agent: 'future', admin: 'future' } },
  },
};

const FINAL_LABELS = { completed: 'completed', cancelled: 'cancelled', no_show: 'marked as a no-show' };
const TO_LABELS = { confirmed: 'confirmed', completed: 'completed', cancelled: 'cancelled', no_show: 'marked as a no-show' };

function deny(httpStatus, code, message) {
  return { ok: false, httpStatus, code, message };
}

/**
 * Decides whether `role` may move an appointment from `from` to `to` right now.
 * Returns { ok: true } or { ok: false, httpStatus, code, message }.
 */
function evaluateTransition({ role, from, to, scheduledAt, now = new Date() }) {
  if (!STATUSES.includes(to)) return deny(422, 'INVALID_STATUS', 'Invalid appointment status.');
  if (!role) return deny(403, 'FORBIDDEN', 'You do not have permission to update this appointment.');

  if (TERMINAL_STATUSES.includes(from)) {
    return deny(409, 'APPOINTMENT_FINAL', `This viewing is already ${FINAL_LABELS[from]} and can no longer be changed.`);
  }
  if (from === to) return deny(409, 'NO_CHANGE', `This viewing is already ${from}.`);

  // Buyers can only ever cancel their own viewing request.
  if (role === 'buyer' && to !== 'cancelled') {
    return deny(403, 'FORBIDDEN_TRANSITION', 'You can only cancel your own viewing requests. The agent confirms and completes viewings.');
  }

  const rule = TRANSITIONS[from] && TRANSITIONS[from][to];
  if (!rule) {
    if (to === 'requested') return deny(409, 'INVALID_TRANSITION', 'A viewing cannot be moved back to requested.');
    if (from === 'requested') {
      return deny(409, 'INVALID_TRANSITION', `A viewing must be confirmed before it can be ${TO_LABELS[to] || to}.`);
    }
    return deny(409, 'INVALID_TRANSITION', `A viewing cannot change from ${from} to ${to}.`);
  }
  if (!rule.by.includes(role)) {
    return deny(403, 'FORBIDDEN_TRANSITION', 'You do not have permission to make this change.');
  }

  const started = scheduledAt.getTime() <= now.getTime();
  const timeRule = rule.time[role];
  if (timeRule === 'future' && started) {
    if (to === 'confirmed') {
      return deny(409, 'APPOINTMENT_PAST', 'The requested time has already passed, so this viewing can no longer be confirmed. Please cancel it instead.');
    }
    return deny(409, 'APPOINTMENT_PAST', 'This viewing has already started, so it can no longer be cancelled.');
  }
  if (timeRule === 'started' && !started) {
    return deny(409, 'APPOINTMENT_NOT_STARTED', `This viewing has not started yet, so it cannot be ${TO_LABELS[to]} yet.`);
  }
  return { ok: true };
}

/** Target statuses the given role may apply right now (drives the UI buttons). */
function allowedActions({ role, status, scheduledAt, now = new Date() }) {
  if (!role) return [];
  return STATUSES.filter((to) => evaluateTransition({ role, from: status, to, scheduledAt, now }).ok);
}

module.exports = {
  STATUSES,
  ACTIVE_STATUSES,
  TERMINAL_STATUSES,
  DEFAULT_DURATION_MINUTES,
  MIN_DURATION_MINUTES,
  MAX_DURATION_MINUTES,
  MAX_ADVANCE_DAYS,
  AppointmentConflictError,
  parseScheduledAt,
  toMysqlUtc,
  fromMysqlUtc,
  addMinutes,
  intervalsOverlap,
  validateNewSchedule,
  getViewerRole,
  evaluateTransition,
  allowedActions,
};
