// src/models/appointment.model.js

const { pool } = require('../config/db');
const {
  ACTIVE_STATUSES,
  MAX_DURATION_MINUTES,
  AppointmentConflictError,
  toMysqlUtc,
  addMinutes,
} = require('../utils/appointmentRules');

// scheduled_at is stored as UTC (see utils/appointmentRules.js).

// Shared read shape for the Appointments page + dashboard: property image/location,
// both parties' names, and the related conversation (if one exists).
//
// The conversation join is exact and safe: conversations has UNIQUE
// (buyer_id, agent_user_id, property_id), so it yields at most one row per
// appointment. No conversation is invented when none exists (conversation_id = NULL).
//
// Existing columns are unchanged: `ap.*`, `property_title`, and the requester's
// `first_name`, `last_name`, `email` (previously returned by the agent list) are still returned.
const DETAIL_SELECT = `
  SELECT ap.*,
         p.title AS property_title, p.status AS property_status,
         l.neighborhood AS property_neighborhood, l.city AS property_city, l.state AS property_state,
         (SELECT pi.image_url FROM property_images pi
           WHERE pi.property_id = p.property_id AND pi.is_primary = TRUE LIMIT 1) AS property_image_url,
         ag.user_id AS agent_user_id, ag.agency_name AS agent_agency_name,
         au.first_name AS agent_first_name, au.last_name AS agent_last_name, au.avatar_url AS agent_avatar_url,
         bu.first_name AS buyer_first_name, bu.last_name AS buyer_last_name, bu.avatar_url AS buyer_avatar_url,
         bu.first_name AS first_name, bu.last_name AS last_name, bu.email AS email,
         c.conversation_id AS conversation_id
  FROM appointments ap
  JOIN properties p ON p.property_id = ap.property_id
  LEFT JOIN locations l ON l.location_id = p.location_id
  JOIN agents ag ON ag.agent_id = ap.agent_id
  JOIN users au ON au.user_id = ag.user_id
  JOIN users bu ON bu.user_id = ap.user_id
  LEFT JOIN conversations c
         ON c.buyer_id = ap.user_id AND c.agent_user_id = ag.user_id AND c.property_id = ap.property_id`;

/**
 * Creates a viewing request only if the slot is free, atomically.
 *
 * Concurrency: every booking for an agent first takes a row lock on that agent
 * (SELECT ... FOR UPDATE), so two simultaneous requests for the same agent are
 * serialized; the second one then sees the first one's committed row in its
 * (locking) overlap read. Different agents never block each other.
 *
 * Rules enforced here (throws AppointmentConflictError -> HTTP 409):
 *  - DUPLICATE_APPOINTMENT: the same buyer already has an active (requested/confirmed)
 *    upcoming viewing for this property.
 *  - AGENT_UNAVAILABLE: the agent has an active viewing overlapping
 *    [start, start + duration). Back-to-back viewings are allowed.
 *
 * @param {Date} start  UTC instant (already validated as a future time)
 * @param {Date} now    the clock used for "upcoming" checks (same clock the controller used)
 */
async function createIfAvailable({ propertyId, userId, agentId, start, durationMinutes, notes, now = new Date() }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [agentRows] = await connection.query('SELECT agent_id FROM agents WHERE agent_id = :agentId FOR UPDATE', { agentId });
    if (!agentRows[0]) {
      const err = new Error('Agent not found');
      err.statusCode = 404;
      throw err;
    }

    const startSql = toMysqlUtc(start);
    const endSql = toMysqlUtc(addMinutes(start, durationMinutes));
    // Any overlapping existing viewing must start after (start - longest possible duration);
    // this bounds the scan to a small range on idx_appointments_agent_time.
    const windowStartSql = toMysqlUtc(addMinutes(start, -MAX_DURATION_MINUTES));
    const nowSql = toMysqlUtc(now);

    const [duplicates] = await connection.query(
      `SELECT appointment_id FROM appointments
       WHERE user_id = :userId AND property_id = :propertyId
         AND status IN ('requested','confirmed') AND scheduled_at > :nowSql
       LIMIT 1 FOR UPDATE`,
      { userId, propertyId, nowSql }
    );
    if (duplicates[0]) {
      throw new AppointmentConflictError(
        'DUPLICATE_APPOINTMENT',
        'You already have an active viewing request for this property. Cancel it first if you want to choose a different time.'
      );
    }

    const [overlaps] = await connection.query(
      `SELECT appointment_id FROM appointments
       WHERE agent_id = :agentId
         AND status IN ('requested','confirmed')
         AND scheduled_at >= :windowStartSql AND scheduled_at < :endSql
         AND DATE_ADD(scheduled_at, INTERVAL duration_minutes MINUTE) > :startSql
       LIMIT 1 FOR UPDATE`,
      { agentId, windowStartSql, endSql, startSql }
    );
    if (overlaps[0]) {
      throw new AppointmentConflictError(
        'AGENT_UNAVAILABLE',
        'This agent already has a viewing scheduled during that time. Please choose another time.'
      );
    }

    const [result] = await connection.query(
      `INSERT INTO appointments (property_id, user_id, agent_id, scheduled_at, duration_minutes, notes)
       VALUES (:propertyId, :userId, :agentId, :startSql, :durationMinutes, :notes)`,
      { propertyId, userId, agentId, startSql, durationMinutes, notes: notes || null }
    );

    await connection.commit();
    return result.insertId;
  } catch (err) {
    try {
      await connection.rollback();
    } catch (rollbackErr) {
      // connection may already be gone; the original error is what matters
    }
    throw err;
  } finally {
    connection.release();
  }
}

/** Raw row — used for authorization + transition checks. */
async function findById(appointmentId) {
  const [rows] = await pool.query('SELECT * FROM appointments WHERE appointment_id = :appointmentId LIMIT 1', { appointmentId });
  return rows[0] || null;
}

/** Enriched row (see DETAIL_SELECT). */
async function findDetailedById(appointmentId) {
  const [rows] = await pool.query(`${DETAIL_SELECT} WHERE ap.appointment_id = :appointmentId LIMIT 1`, { appointmentId });
  return rows[0] || null;
}

async function listForUser(userId) {
  const [rows] = await pool.query(`${DETAIL_SELECT} WHERE ap.user_id = :userId ORDER BY ap.scheduled_at ASC`, { userId });
  return rows;
}

async function listForAgent(agentId) {
  const [rows] = await pool.query(`${DETAIL_SELECT} WHERE ap.agent_id = :agentId ORDER BY ap.scheduled_at ASC`, { agentId });
  return rows;
}

/**
 * Compare-and-set: only changes the row if it is still in `fromStatus`, so two
 * people acting at the same moment (buyer cancels while agent confirms) can never
 * overwrite each other. Returns true if this call performed the change.
 */
async function transitionStatus(appointmentId, fromStatus, toStatus) {
  const [result] = await pool.query(
    'UPDATE appointments SET status = :toStatus WHERE appointment_id = :appointmentId AND status = :fromStatus',
    { appointmentId, fromStatus, toStatus }
  );
  return result.affectedRows === 1;
}

module.exports = { createIfAvailable, findById, findDetailedById, listForUser, listForAgent, transitionStatus, ACTIVE_STATUSES };
