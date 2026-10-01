// In-memory stand-ins for the model layer, so the REAL controller can be exercised without MySQL.
// NOTE: the overlap/duplicate checks here mirror the SQL in models/appointment.model.js in JS;
// they verify the controller's handling, NOT the SQL itself (that needs a real MySQL).
const path = require('node:path');
const rules = require('../../src/utils/appointmentRules');

const SRC = path.join(__dirname, '..', '..', 'src');
const MIN = 60 * 1000;

function makeWorld() {
  const world = {
    users: {
      1: { user_id: 1, first_name: 'Bella', last_name: 'Buyer', email: 'bella@x.com', role: 'buyer' },
      2: { user_id: 2, first_name: 'Ben', last_name: 'Buyer', email: 'ben@x.com', role: 'buyer' },
      3: { user_id: 3, first_name: 'Aaron', last_name: 'Agent', email: 'aaron@x.com', role: 'agent' },
      4: { user_id: 4, first_name: 'Dana', last_name: 'Dealer', email: 'dana@x.com', role: 'agent' },
      5: { user_id: 5, first_name: 'Ada', last_name: 'Admin', email: 'ada@x.com', role: 'admin' },
    },
    agents: { 100: { agent_id: 100, user_id: 3 }, 200: { agent_id: 200, user_id: 4 } },
    properties: {
      10: { property_id: 10, title: 'Loft', listed_by_user_id: 3, agent_id: 100, status: 'active' },
      11: { property_id: 11, title: 'Villa', listed_by_user_id: 3, agent_id: 100, status: 'active' },
      12: { property_id: 12, title: 'Cottage', listed_by_user_id: 4, agent_id: 200, status: 'active' },
      13: { property_id: 13, title: 'Draft house', listed_by_user_id: 3, agent_id: 100, status: 'draft' },
      14: { property_id: 14, title: 'FSBO', listed_by_user_id: 2, agent_id: null, status: 'active' },
      15: { property_id: 15, title: 'Sold house', listed_by_user_id: 3, agent_id: 100, status: 'sold' },
    },
    conversations: [{ conversation_id: 77, buyer_id: 1, agent_user_id: 3, property_id: 10 }],
    appointments: [],
    notifications: [],
    nextId: 1,
    forceRaceLoss: false, // makes transitionStatus behave as if another request won
  };

  const detail = (a) => {
    const p = world.properties[a.property_id];
    const ag = world.agents[a.agent_id];
    const au = world.users[ag.user_id];
    const bu = world.users[a.user_id];
    const conv = world.conversations.find((c) => c.buyer_id === a.user_id && c.agent_user_id === ag.user_id && c.property_id === a.property_id);
    return {
      ...a,
      property_title: p.title, property_status: p.status, property_image_url: null, property_city: 'Austin',
      agent_user_id: ag.user_id, agent_first_name: au.first_name, agent_last_name: au.last_name,
      buyer_first_name: bu.first_name, buyer_last_name: bu.last_name, first_name: bu.first_name, last_name: bu.last_name, email: bu.email,
      conversation_id: conv ? conv.conversation_id : null,
    };
  };
  const startOf = (a) => rules.fromMysqlUtc(a.scheduled_at);

  world.seed = ({ user_id = 1, agent_id = 100, property_id = 10, startInMinutes = 120, duration_minutes = 30, status = 'requested', notes = null }) => {
    const a = {
      appointment_id: world.nextId++, property_id, user_id, agent_id,
      scheduled_at: rules.toMysqlUtc(new Date(Math.floor((Date.now() + startInMinutes * MIN) / MIN) * MIN)),
      duration_minutes, status, notes,
    };
    world.appointments.push(a);
    return a;
  };

  world.models = {
    property: { findOwnerInfo: async (id) => world.properties[id] || null },
    agent: {
      findFullById: async (id) => world.agents[id] || null,
      findByUserId: async (userId) => Object.values(world.agents).find((a) => a.user_id === userId) || null,
    },
    notification: { create: async (n) => { world.notifications.push(n); } },
    appointment: {
      createIfAvailable: async ({ propertyId, userId, agentId, start, durationMinutes, notes, now }) => {
        const active = (a) => rules.ACTIVE_STATUSES.includes(a.status);
        if (world.appointments.some((a) => active(a) && a.user_id === userId && a.property_id === propertyId && startOf(a) > now)) {
          throw new rules.AppointmentConflictError('DUPLICATE_APPOINTMENT', 'You already have an active viewing request for this property.');
        }
        if (world.appointments.some((a) => active(a) && a.agent_id === agentId && rules.intervalsOverlap(startOf(a), a.duration_minutes, start, durationMinutes))) {
          throw new rules.AppointmentConflictError('AGENT_UNAVAILABLE', 'This agent already has a viewing scheduled during that time. Please choose another time.');
        }
        const a = { appointment_id: world.nextId++, property_id: propertyId, user_id: userId, agent_id: agentId, scheduled_at: rules.toMysqlUtc(start), duration_minutes: durationMinutes, status: 'requested', notes: notes || null };
        world.appointments.push(a);
        return a.appointment_id;
      },
      findById: async (id) => { const a = world.appointments.find((x) => x.appointment_id === id); return a ? { ...a } : null; },
      findDetailedById: async (id) => { const a = world.appointments.find((x) => x.appointment_id === id); return a ? detail(a) : null; },
      listForUser: async (userId) => world.appointments.filter((a) => a.user_id === userId).map(detail),
      listForAgent: async (agentId) => world.appointments.filter((a) => a.agent_id === agentId).map(detail),
      transitionStatus: async (id, from, to) => {
        if (world.forceRaceLoss) return false;
        const a = world.appointments.find((x) => x.appointment_id === id);
        if (!a || a.status !== from) return false;
        a.status = to;
        return true;
      },
    },
  };
  return world;
}

/** Loads the REAL controller with the model layer replaced by the given world's stubs. */
function loadController(world) {
  const stubs = { property: world.models.property, agent: world.models.agent, notification: world.models.notification, appointment: world.models.appointment };
  for (const [name, exports] of Object.entries(stubs)) {
    const file = require.resolve(path.join(SRC, 'models', `${name}.model.js`));
    require.cache[file] = { id: file, filename: file, loaded: true, exports, children: [], paths: [] };
  }
  const controllerFile = require.resolve(path.join(SRC, 'controllers', 'appointment.controller.js'));
  delete require.cache[controllerFile];
  return require(controllerFile);
}

/** Invokes an Express handler with a fake req/res and resolves { status, body }. */
function call(handler, { user, params = {}, body = {} } = {}) {
  return new Promise((resolve, reject) => {
    const res = {
      code: 200,
      status(c) { this.code = c; return this; },
      json(b) { resolve({ status: this.code, body: b }); return this; },
    };
    handler({ user, params, body, headers: {} }, res, reject);
  });
}

const iso = (minutesFromNow) => new Date(Date.now() + minutesFromNow * MIN).toISOString();
const asUser = (world, id) => ({ userId: id, role: world.users[id].role });

module.exports = { makeWorld, loadController, call, iso, asUser };
