// src/controllers/appointment.controller.js

const propertyModel = require('../models/property.model');
const agentModel = require('../models/agent.model');
const appointmentModel = require('../models/appointment.model');
const notificationModel = require('../models/notification.model');
const asyncHandler = require('../utils/asyncHandler');
const { success, failure } = require('../utils/apiResponse');
const rules = require('../utils/appointmentRules');

const STATUS_TITLES = {
  confirmed: 'Viewing confirmed',
  completed: 'Viewing completed',
  cancelled: 'Viewing cancelled',
  no_show: 'Viewing marked as a no-show',
};

/** "Sep 25, 2026, 10:00 AM UTC" — server-side text has no user timezone, so say UTC explicitly. */
function formatWhenUtc(date) {
  return `${date.toLocaleString('en-US', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' })} UTC`;
}

/** Notifications are a side effect: never fail (or double-submit) a booking because one couldn't be written. */
async function notifySafely(payload) {
  try {
    await notificationModel.create(payload);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[appointment] notification failed', err);
  }
}

/** Attaches what the caller may do RIGHT NOW, so the UI never has to re-implement the rules. */
function withActions(appointment, role, now = new Date()) {
  return {
    ...appointment,
    available_actions: rules.allowedActions({
      role,
      status: appointment.status,
      scheduledAt: rules.fromMysqlUtc(appointment.scheduled_at),
      now,
    }),
  };
}

/**
 * POST /api/appointments
 * Auth required. The requester is ALWAYS req.user (JWT) and the agent is ALWAYS the
 * property's assigned agent — neither is taken from the request body.
 *
 * Body: { propertyId, scheduledAt (ISO-8601 with offset), durationMinutes?, notes? }
 * Responses: 201 ok | 404 property | 409 conflict/unavailable | 403 own listing | 422 bad time
 */
const createAppointment = asyncHandler(async (req, res) => {
  const { propertyId, scheduledAt, durationMinutes, notes } = req.body;
  const now = new Date();

  const schedule = rules.validateNewSchedule({ scheduledAt, durationMinutes }, now);
  if (!schedule.ok) return failure(res, schedule.message, schedule.httpStatus, { code: schedule.code });

  const property = await propertyModel.findOwnerInfo(propertyId);
  if (!property) return failure(res, 'Property not found', 404);
  if (property.status !== 'active') {
    return failure(res, 'This property is not currently available for viewings.', 409, { code: 'PROPERTY_UNAVAILABLE' });
  }
  if (!property.agent_id) {
    return failure(res, 'This property does not have an assigned agent to schedule a viewing with', 400);
  }

  const agent = await agentModel.findFullById(property.agent_id);
  if (!agent) {
    return failure(res, 'This property does not have an assigned agent to schedule a viewing with', 400);
  }
  if (agent.user_id === req.user.userId || property.listed_by_user_id === req.user.userId) {
    return failure(res, 'You cannot request a viewing on your own listing.', 403, { code: 'OWN_LISTING' });
  }

  let appointmentId;
  try {
    appointmentId = await appointmentModel.createIfAvailable({
      propertyId,
      userId: req.user.userId,
      agentId: property.agent_id,
      start: schedule.start,
      durationMinutes: schedule.durationMinutes,
      notes,
      now,
    });
  } catch (err) {
    if (err instanceof rules.AppointmentConflictError) {
      return failure(res, err.message, 409, { code: err.code });
    }
    throw err;
  }

  await notifySafely({
    userId: agent.user_id,
    type: 'appointment',
    title: 'New viewing request',
    body: `Requested for ${formatWhenUtc(schedule.start)}`,
    relatedEntityType: 'appointment',
    relatedEntityId: appointmentId,
  });

  const appointment = await appointmentModel.findDetailedById(appointmentId);
  return success(res, { appointment: withActions(appointment, 'buyer', now) }, 201);
});

/**
 * GET /api/appointments/me — appointments the caller REQUESTED (as a buyer).
 */
const getMyAppointments = asyncHandler(async (req, res) => {
  const now = new Date();
  const rows = await appointmentModel.listForUser(req.user.userId);
  return success(res, { appointments: rows.map((row) => withActions(row, 'buyer', now)) }, 200);
});

/**
 * GET /api/appointments/agent — agent only. The agent is resolved from the JWT user,
 * so an agent can only ever list their own appointments.
 */
const getAgentAppointments = asyncHandler(async (req, res) => {
  const agent = await agentModel.findByUserId(req.user.userId);
  if (!agent) return failure(res, 'Agent profile not found for this account', 404);

  const now = new Date();
  const rows = await appointmentModel.listForAgent(agent.agent_id);
  return success(res, { appointments: rows.map((row) => withActions(row, 'agent', now)) }, 200);
});

/**
 * PUT /api/appointments/:id/status
 * Body: { status }. The caller must be the requester, the assigned agent, or an admin;
 * whether the specific change is allowed is decided by evaluateTransition() (role +
 * current status + time), not by the client.
 */
const updateAppointmentStatus = asyncHandler(async (req, res) => {
  const appointmentId = Number(req.params.id);
  const { status: toStatus } = req.body;
  const now = new Date();

  const appointment = await appointmentModel.findById(appointmentId);
  if (!appointment) return failure(res, 'Appointment not found', 404);

  const ownAgent = await agentModel.findByUserId(req.user.userId);
  const role = rules.getViewerRole(appointment, req.user, ownAgent);
  if (!role) return failure(res, 'You do not have permission to update this appointment', 403);

  const decision = rules.evaluateTransition({
    role,
    from: appointment.status,
    to: toStatus,
    scheduledAt: rules.fromMysqlUtc(appointment.scheduled_at),
    now,
  });
  if (!decision.ok) return failure(res, decision.message, decision.httpStatus, { code: decision.code });

  const changed = await appointmentModel.transitionStatus(appointmentId, appointment.status, toStatus);
  if (!changed) {
    return failure(res, 'This viewing was just updated by someone else. Please refresh and try again.', 409, {
      code: 'APPOINTMENT_CHANGED',
    });
  }

  // Tell the other side (an admin's change notifies both parties).
  const detailed = await appointmentModel.findDetailedById(appointmentId);
  const recipients = new Set();
  if (role !== 'buyer') recipients.add(appointment.user_id);
  if (role !== 'agent' && detailed) recipients.add(detailed.agent_user_id);
  recipients.delete(req.user.userId);
  for (const userId of recipients) {
    await notifySafely({
      userId,
      type: 'appointment_status',
      title: STATUS_TITLES[toStatus] || `Appointment ${toStatus}`,
      body: detailed ? detailed.property_title : undefined,
      relatedEntityType: 'appointment',
      relatedEntityId: appointmentId,
    });
  }

  return success(res, { appointment: detailed ? withActions(detailed, role, now) : null }, 200);
});

module.exports = { createAppointment, getMyAppointments, getAgentAppointments, updateAppointmentStatus };
