// Runs the REAL appointment controller against in-memory models (no MySQL).
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeWorld, loadController, call, iso, asUser } = require('./helpers/memoryWorld');

function setup() {
  const world = makeWorld();
  const ctl = loadController(world);
  const as = (id) => asUser(world, id);
  const create = (userId, body) => call(ctl.createAppointment, { user: as(userId), body: { propertyId: 10, ...body } });
  const update = (userId, id, status) => call(ctl.updateAppointmentStatus, { user: as(userId), params: { id: String(id) }, body: { status } });
  return { world, ctl, as, create, update };
}

// ------------------------------------------------------------------ create
test('create: success uses the JWT user and the property agent, ignoring spoofed body ids', async () => {
  const { world, create } = setup();
  const r = await create(1, { scheduledAt: iso(120), durationMinutes: 45, notes: 'Hello', userId: 2, user_id: 2, agentId: 200, agent_id: 200, status: 'confirmed' });
  assert.equal(r.status, 201);
  const a = world.appointments[0];
  assert.equal(a.user_id, 1, 'requester comes from req.user');
  assert.equal(a.agent_id, 100, "agent comes from the property, not the body");
  assert.equal(a.status, 'requested', 'cannot self-confirm on create');
  assert.equal(a.duration_minutes, 45);
  assert.deepEqual(r.body.data.appointment.available_actions, ['cancelled']);
  assert.equal(r.body.data.appointment.conversation_id, 77, 'existing buyer<->agent conversation is linked');
  assert.equal(world.notifications.length, 1);
  assert.equal(world.notifications[0].userId, 3, 'agent user is notified');
});

test('create: bad / past / too-far / timezone-less times are rejected with 422 and nothing is stored', async () => {
  const { world, create } = setup();
  for (const [scheduledAt, code] of [
    [iso(-10), 'PAST_DATETIME'],
    ['2030-01-01T10:00:00', 'INVALID_DATETIME'],
    ['not-a-date', 'INVALID_DATETIME'],
    [iso(366 * 24 * 60), 'TOO_FAR_AHEAD'],
  ]) {
    const r = await create(1, { scheduledAt });
    assert.equal(r.status, 422, scheduledAt);
    assert.equal(r.body.details.code, code, scheduledAt);
  }
  assert.equal((await create(1, { scheduledAt: iso(120), durationMinutes: 5 })).body.details.code, 'INVALID_DURATION');
  assert.equal(world.appointments.length, 0);
});

test('create: property must exist, be active, have an agent, and not be the requester\'s own listing', async () => {
  const { create } = setup();
  assert.equal((await create(1, { propertyId: 999, scheduledAt: iso(120) })).status, 404);
  for (const propertyId of [13, 15]) {
    const r = await create(1, { propertyId, scheduledAt: iso(120) });
    assert.equal(r.status, 409); assert.equal(r.body.details.code, 'PROPERTY_UNAVAILABLE');
  }
  assert.equal((await create(1, { propertyId: 14, scheduledAt: iso(120) })).status, 400, 'no agent');
  const own = await create(3, { scheduledAt: iso(120) });   // agent user 3 books property 10 (their own listing)
  assert.equal(own.status, 403); assert.equal(own.body.details.code, 'OWN_LISTING');
});

test('create: double booking -> 409 with the professional message; back-to-back and other agents are fine', async () => {
  const { world, create } = setup();
  const first = await create(1, { propertyId: 10, scheduledAt: iso(600), durationMinutes: 60 });
  assert.equal(first.status, 201);

  const clash = await create(2, { propertyId: 11, scheduledAt: iso(630), durationMinutes: 30 }); // agent 100 again, overlaps
  assert.equal(clash.status, 409);
  assert.equal(clash.body.details.code, 'AGENT_UNAVAILABLE');
  assert.equal(clash.body.error, 'This agent already has a viewing scheduled during that time. Please choose another time.');

  assert.equal((await create(2, { propertyId: 11, scheduledAt: iso(660), durationMinutes: 30 })).status, 201, 'starts exactly when the first ends');
  assert.equal((await create(2, { propertyId: 12, scheduledAt: iso(600) })).status, 201, 'a different agent is free at the same time');
  assert.equal(world.appointments.length, 3);
});

test('create: cancelled / completed / no_show viewings do not block the slot', async () => {
  const { world, create } = setup();
  for (const status of ['cancelled', 'completed', 'no_show']) {
    world.appointments.length = 0;
    world.seed({ user_id: 2, property_id: 11, startInMinutes: 600, duration_minutes: 60, status });
    assert.equal((await create(1, { propertyId: 10, scheduledAt: iso(610) })).status, 201, status);
  }
});

test('create: duplicate submission (same buyer + property) -> 409 DUPLICATE_APPOINTMENT, only one row', async () => {
  const { world, create } = setup();
  const body = { scheduledAt: iso(300) };
  const [a, b] = await Promise.all([create(1, body), create(1, body)]);
  assert.deepEqual([a.status, b.status].sort(), [201, 409]);
  assert.equal(world.appointments.length, 1);
  const again = await create(1, { scheduledAt: iso(900) });
  assert.equal(again.body.details.code, 'DUPLICATE_APPOINTMENT');
  world.appointments[0].status = 'cancelled';
  assert.equal((await create(1, { scheduledAt: iso(900) })).status, 201, 'allowed again after cancelling');
});

// ------------------------------------------------------------------ lists
test('lists: buyers only get their own; agents only their own; both carry available_actions', async () => {
  const { world, ctl, as } = setup();
  world.seed({ user_id: 1, agent_id: 100, property_id: 10 });
  world.seed({ user_id: 2, agent_id: 100, property_id: 11, startInMinutes: 500 });
  world.seed({ user_id: 1, agent_id: 200, property_id: 12, startInMinutes: 700 });

  const mine = await call(ctl.getMyAppointments, { user: as(1) });
  assert.deepEqual(mine.body.data.appointments.map((a) => a.appointment_id), [1, 3]);
  assert.ok(mine.body.data.appointments.every((a) => Array.isArray(a.available_actions)));

  const agentA = await call(ctl.getAgentAppointments, { user: as(3) });
  assert.deepEqual(agentA.body.data.appointments.map((a) => a.appointment_id), [1, 2], 'Agent A sees only Agent A appointments');
  assert.deepEqual(agentA.body.data.appointments[0].available_actions, ['confirmed', 'cancelled']);
  const agentB = await call(ctl.getAgentAppointments, { user: as(4) });
  assert.deepEqual(agentB.body.data.appointments.map((a) => a.appointment_id), [3]);

  const noProfile = await call(ctl.getAgentAppointments, { user: as(1) });
  assert.equal(noProfile.status, 404, 'a user with no agent profile gets no agent data');
});

// ------------------------------------------------------------------ update: ownership
test('update: another buyer / another agent / nonexistent id are refused', async () => {
  const { world, update } = setup();
  const a = world.seed({ user_id: 1, agent_id: 100 });
  assert.equal((await update(2, a.appointment_id, 'cancelled')).status, 403, 'Buyer B cannot touch Buyer A');
  assert.equal((await update(4, a.appointment_id, 'confirmed')).status, 403, 'Agent B cannot touch Agent A');
  assert.equal((await update(1, 9999, 'cancelled')).status, 404);
  assert.equal(world.appointments[0].status, 'requested', 'nothing changed');
});

// ------------------------------------------------------------------ update: buyer
test('buyer: may cancel an eligible future viewing (requested or confirmed)', async () => {
  const { world, update } = setup();
  const r1 = world.seed({ user_id: 1, status: 'requested' });
  const r2 = world.seed({ user_id: 1, status: 'confirmed', startInMinutes: 500 });
  const res = await update(1, r1.appointment_id, 'cancelled');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.appointment.status, 'cancelled');
  assert.deepEqual(res.body.data.appointment.available_actions, [], 'terminal state offers no actions');
  assert.equal((await update(1, r2.appointment_id, 'cancelled')).status, 200);
  assert.deepEqual(world.notifications.map((n) => n.userId), [3, 3], 'agent is told');
});

test('buyer: can NEVER confirm, complete, no-show or revert their own appointment', async () => {
  const { world, update } = setup();
  const a = world.seed({ user_id: 1, status: 'requested' });
  const c = world.seed({ user_id: 1, status: 'confirmed', startInMinutes: -60, property_id: 11 });
  for (const status of ['confirmed', 'completed', 'no_show', 'requested']) {
    const r = await update(1, a.appointment_id, status);
    assert.ok(r.status === 403 || r.status === 409, `${status}: ${r.status}`);
    assert.equal(world.appointments[0].status, 'requested');
  }
  const r = await update(1, c.appointment_id, 'completed');
  assert.equal(r.status, 403); assert.equal(r.body.details.code, 'FORBIDDEN_TRANSITION');
  assert.equal(world.appointments[1].status, 'confirmed');
});

test('buyer: cannot cancel a viewing that has already started, or one that is already final', async () => {
  const { world, update } = setup();
  const past = world.seed({ user_id: 1, status: 'confirmed', startInMinutes: -10 });
  const r = await update(1, past.appointment_id, 'cancelled');
  assert.equal(r.status, 409); assert.equal(r.body.details.code, 'APPOINTMENT_PAST');
  const done = world.seed({ user_id: 1, status: 'completed', startInMinutes: -600, property_id: 11 });
  assert.equal((await update(1, done.appointment_id, 'cancelled')).body.details.code, 'APPOINTMENT_FINAL');
  const gone = world.seed({ user_id: 1, status: 'cancelled', property_id: 12, agent_id: 200 });
  assert.equal((await update(1, gone.appointment_id, 'cancelled')).status, 409);
});

// ------------------------------------------------------------------ update: agent
test('agent: full lifecycle requested -> confirmed -> completed; buyer is notified each time', async () => {
  const { world, update } = setup();
  const future = world.seed({ user_id: 1, startInMinutes: 120 });
  assert.equal((await update(3, future.appointment_id, 'confirmed')).body.data.appointment.status, 'confirmed');
  const started = world.seed({ user_id: 1, status: 'confirmed', startInMinutes: -45, property_id: 11 });
  const done = await update(3, started.appointment_id, 'completed');
  assert.equal(done.status, 200); assert.equal(done.body.data.appointment.status, 'completed');
  assert.deepEqual(done.body.data.appointment.available_actions, []);
  assert.deepEqual(world.notifications.map((n) => n.userId), [1, 1]);
  assert.equal(world.notifications[0].title, 'Viewing confirmed');
});

test('agent: no_show is supported after the start time; cancel works from requested and (future) confirmed', async () => {
  const { world, update } = setup();
  const ns = world.seed({ user_id: 1, status: 'confirmed', startInMinutes: -30 });
  assert.equal((await update(3, ns.appointment_id, 'no_show')).body.data.appointment.status, 'no_show');
  const f = world.seed({ user_id: 1, status: 'confirmed', startInMinutes: 400, property_id: 11 });
  assert.equal((await update(3, f.appointment_id, 'cancelled')).status, 200);
  const stale = world.seed({ user_id: 2, status: 'requested', startInMinutes: -500, property_id: 11 });
  assert.equal((await update(3, stale.appointment_id, 'cancelled')).status, 200, 'agent may close a stale past request');
});

test('agent: invalid transitions are refused server-side (not just hidden in the UI)', async () => {
  const { world, update } = setup();
  const req = world.seed({ user_id: 1, status: 'requested', startInMinutes: 120 });
  const future = world.seed({ user_id: 1, status: 'confirmed', startInMinutes: 300, property_id: 11 });
  const past = world.seed({ user_id: 2, status: 'requested', startInMinutes: -60, property_id: 11 });
  const cancelled = world.seed({ user_id: 2, status: 'cancelled', startInMinutes: 300, property_id: 10 });
  const completed = world.seed({ user_id: 2, status: 'completed', startInMinutes: -300, property_id: 11 });

  assert.equal((await update(3, req.appointment_id, 'completed')).body.details.code, 'INVALID_TRANSITION');
  assert.equal((await update(3, req.appointment_id, 'no_show')).body.details.code, 'INVALID_TRANSITION');
  assert.equal((await update(3, future.appointment_id, 'completed')).body.details.code, 'APPOINTMENT_NOT_STARTED');
  assert.equal((await update(3, future.appointment_id, 'requested')).body.details.code, 'INVALID_TRANSITION');
  assert.equal((await update(3, past.appointment_id, 'confirmed')).body.details.code, 'APPOINTMENT_PAST');
  assert.equal((await update(3, cancelled.appointment_id, 'confirmed')).body.details.code, 'APPOINTMENT_FINAL');
  assert.equal((await update(3, completed.appointment_id, 'cancelled')).body.details.code, 'APPOINTMENT_FINAL');
  assert.equal((await update(3, completed.appointment_id, 'requested')).body.details.code, 'APPOINTMENT_FINAL');
  const banana = await update(3, req.appointment_id, 'banana');
  assert.equal(banana.status, 422, 'arbitrary status values never reach the database');
  assert.equal((await update(3, req.appointment_id, 'requested')).body.details.code, 'NO_CHANGE');
  assert.deepEqual(world.appointments.map((a) => a.status), ['requested', 'confirmed', 'requested', 'cancelled', 'completed'], 'no row was modified');
});

test('update: losing a race (row changed by someone else) -> 409 APPOINTMENT_CHANGED', async () => {
  const { world, update } = setup();
  const a = world.seed({ user_id: 1 });
  world.forceRaceLoss = true;
  const r = await update(3, a.appointment_id, 'confirmed');
  assert.equal(r.status, 409); assert.equal(r.body.details.code, 'APPOINTMENT_CHANGED');
  assert.equal(world.notifications.length, 0, 'no notification for a change that did not happen');
});

test('security: a requester who is also the assigned agent (legacy data) cannot confirm their own request', async () => {
  const { world, update } = setup();
  const a = world.seed({ user_id: 3, agent_id: 100 });   // agent user 3 requested a viewing with their own agent id
  const r = await update(3, a.appointment_id, 'confirmed');
  assert.equal(r.status, 403);
  assert.equal(world.appointments[0].status, 'requested');
});

test('admin: participates under the same state machine and may confirm any future request', async () => {
  const { world, update } = setup();
  const a = world.seed({ user_id: 1 });
  assert.equal((await update(5, a.appointment_id, 'confirmed')).status, 200);
  assert.deepEqual(world.notifications.map((n) => n.userId).sort(), [1, 3], 'admin change notifies both parties');
  const done = world.seed({ user_id: 1, status: 'completed', startInMinutes: -600, property_id: 11 });
  assert.equal((await update(5, done.appointment_id, 'cancelled')).status, 409, 'admins cannot rewrite history either');
});
