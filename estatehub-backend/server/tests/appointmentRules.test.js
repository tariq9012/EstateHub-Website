// Pure-rule tests: no database, no Express. Run with `npm test`.
const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../src/utils/appointmentRules');

const NOW = new Date('2026-09-20T12:00:00Z');
const minutes = (n) => new Date(NOW.getTime() + n * 60000);

test('parseScheduledAt requires an explicit timezone offset', () => {
  assert.equal(rules.parseScheduledAt('2026-09-25T10:00:00'), null, 'no offset is ambiguous -> rejected');
  assert.equal(rules.parseScheduledAt('2026-09-25 10:00:00'), null);
  assert.equal(rules.parseScheduledAt('banana'), null);
  assert.equal(rules.parseScheduledAt(12345), null);
  assert.equal(rules.parseScheduledAt('2026-13-45T10:00:00Z'), null, 'impossible date');
  assert.equal(rules.parseScheduledAt('2026-09-25T10:00:00Z').toISOString(), '2026-09-25T10:00:00.000Z');
  assert.equal(rules.parseScheduledAt('2026-09-25T10:00:00+05:00').toISOString(), '2026-09-25T05:00:00.000Z');
  assert.equal(rules.parseScheduledAt('2026-09-25T10:00:59.999Z').toISOString(), '2026-09-25T10:00:00.000Z', 'floored to the minute');
  assert.equal(rules.parseScheduledAt('2026-09-25T10:00:00.123456Z').toISOString(), '2026-09-25T10:00:00.000Z', 'microsecond timestamps (Python/.NET) are accepted');
});

test('MySQL UTC string round-trips', () => {
  const d = new Date('2026-09-25T10:05:00Z');
  assert.equal(rules.toMysqlUtc(d), '2026-09-25 10:05:00');
  assert.equal(rules.fromMysqlUtc('2026-09-25 10:05:00').toISOString(), d.toISOString());
});

test('intervalsOverlap: half-open, back-to-back viewings do not overlap', () => {
  const t = new Date('2026-09-25T10:00:00Z');
  const at = (m) => new Date(t.getTime() + m * 60000);
  assert.equal(rules.intervalsOverlap(t, 30, at(0), 30), true, 'identical');
  assert.equal(rules.intervalsOverlap(t, 30, at(15), 30), true, 'partial');
  assert.equal(rules.intervalsOverlap(t, 60, at(20), 10), true, 'contained');
  assert.equal(rules.intervalsOverlap(t, 30, at(30), 30), false, 'touching end/start');
  assert.equal(rules.intervalsOverlap(t, 30, at(-30), 30), false, 'touching start/end');
  assert.equal(rules.intervalsOverlap(t, 30, at(31), 30), false, 'gap');
});

test('validateNewSchedule', () => {
  const ok = rules.validateNewSchedule({ scheduledAt: minutes(60).toISOString() }, NOW);
  assert.equal(ok.ok, true);
  assert.equal(ok.durationMinutes, 30, 'default duration');
  assert.equal(rules.validateNewSchedule({ scheduledAt: minutes(60).toISOString(), durationMinutes: 45 }, NOW).durationMinutes, 45);

  const past = rules.validateNewSchedule({ scheduledAt: minutes(-1).toISOString() }, NOW);
  assert.deepEqual([past.ok, past.httpStatus, past.code], [false, 422, 'PAST_DATETIME']);
  assert.equal(rules.validateNewSchedule({ scheduledAt: NOW.toISOString() }, NOW).code, 'PAST_DATETIME', '"now" is not the future');

  assert.equal(rules.validateNewSchedule({ scheduledAt: '2026-09-25T10:00:00' }, NOW).code, 'INVALID_DATETIME');
  assert.equal(rules.validateNewSchedule({ scheduledAt: minutes(366 * 24 * 60).toISOString() }, NOW).code, 'TOO_FAR_AHEAD');
  assert.equal(rules.validateNewSchedule({ scheduledAt: minutes(60).toISOString(), durationMinutes: 5 }, NOW).code, 'INVALID_DURATION');
  assert.equal(rules.validateNewSchedule({ scheduledAt: minutes(60).toISOString(), durationMinutes: 481 }, NOW).code, 'INVALID_DURATION');
});

test('getViewerRole derives identity from the JWT user + stored row only', () => {
  const appt = { user_id: 10, agent_id: 7 };
  assert.equal(rules.getViewerRole(appt, { userId: 10, role: 'buyer' }, null), 'buyer');
  assert.equal(rules.getViewerRole(appt, { userId: 20, role: 'agent' }, { agent_id: 7 }), 'agent');
  assert.equal(rules.getViewerRole(appt, { userId: 21, role: 'agent' }, { agent_id: 8 }), null, 'a different agent has no role');
  assert.equal(rules.getViewerRole(appt, { userId: 11, role: 'buyer' }, null), null, 'a different buyer has no role');
  assert.equal(rules.getViewerRole(appt, { userId: 99, role: 'admin' }, null), 'admin');
  assert.equal(rules.getViewerRole(appt, { userId: 10, role: 'agent' }, { agent_id: 7 }), 'buyer', 'requester who is also the agent gets buyer (least) privilege');
});

// ---- exhaustive matrix: role x status x (future|started) x target
const FUTURE = minutes(60);
const STARTED = minutes(-60);
function allowed(role, status, when) {
  return rules.allowedActions({ role, status, scheduledAt: when, now: NOW });
}

test('buyer: can only cancel, only while requested/confirmed and not yet started', () => {
  assert.deepEqual(allowed('buyer', 'requested', FUTURE), ['cancelled']);
  assert.deepEqual(allowed('buyer', 'confirmed', FUTURE), ['cancelled']);
  assert.deepEqual(allowed('buyer', 'requested', STARTED), []);
  assert.deepEqual(allowed('buyer', 'confirmed', STARTED), []);
  for (const s of ['completed', 'cancelled', 'no_show']) {
    assert.deepEqual(allowed('buyer', s, FUTURE), [], `buyer ${s}`);
    assert.deepEqual(allowed('buyer', s, STARTED), [], `buyer ${s} past`);
  }
});

test('agent: requested -> confirm/cancel; confirmed -> complete/no_show/cancel; terminal read-only', () => {
  assert.deepEqual(allowed('agent', 'requested', FUTURE), ['confirmed', 'cancelled']);
  assert.deepEqual(allowed('agent', 'requested', STARTED), ['cancelled'], 'stale request can only be closed');
  assert.deepEqual(allowed('agent', 'confirmed', FUTURE), ['cancelled'], 'cannot complete a viewing that has not happened');
  assert.deepEqual(allowed('agent', 'confirmed', STARTED), ['completed', 'no_show'], 'past confirmed must be resolved, not cancelled');
  for (const s of ['completed', 'cancelled', 'no_show']) {
    assert.deepEqual(allowed('agent', s, FUTURE), []);
    assert.deepEqual(allowed('agent', s, STARTED), []);
  }
});

test('evaluateTransition error codes and HTTP statuses', () => {
  const ev = (role, from, to, when = FUTURE) => rules.evaluateTransition({ role, from, to, scheduledAt: when, now: NOW });
  assert.equal(ev('buyer', 'requested', 'confirmed').httpStatus, 403);
  assert.equal(ev('buyer', 'requested', 'confirmed').code, 'FORBIDDEN_TRANSITION');
  assert.equal(ev('buyer', 'confirmed', 'completed', STARTED).httpStatus, 403);
  assert.equal(ev('buyer', 'requested', 'cancelled', STARTED).code, 'APPOINTMENT_PAST');
  assert.equal(ev('agent', 'requested', 'confirmed', STARTED).code, 'APPOINTMENT_PAST');
  assert.equal(ev('agent', 'confirmed', 'completed', FUTURE).code, 'APPOINTMENT_NOT_STARTED');
  assert.equal(ev('agent', 'requested', 'completed').code, 'INVALID_TRANSITION');
  assert.equal(ev('agent', 'confirmed', 'requested').code, 'INVALID_TRANSITION');
  assert.equal(ev('agent', 'completed', 'cancelled').code, 'APPOINTMENT_FINAL');
  assert.equal(ev('agent', 'cancelled', 'confirmed').code, 'APPOINTMENT_FINAL');
  assert.equal(ev('agent', 'no_show', 'completed', STARTED).code, 'APPOINTMENT_FINAL');
  assert.equal(ev('agent', 'requested', 'requested').code, 'NO_CHANGE');
  assert.equal(ev('agent', 'requested', 'banana').httpStatus, 422);
  assert.equal(ev(null, 'requested', 'confirmed').httpStatus, 403);
  assert.equal(ev('admin', 'requested', 'confirmed').ok, true);
});
