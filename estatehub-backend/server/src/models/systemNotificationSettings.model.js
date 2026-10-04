// src/models/systemNotificationSettings.model.js

const { pool } = require('../config/db');

async function listAll() {
  const { rows } = await pool.query('SELECT * FROM system_notification_settings ORDER BY event_key ASC');
  return rows;
}

async function findByEventKey(eventKey) {
  const { rows } = await pool.query(
    'SELECT * FROM system_notification_settings WHERE event_key = :eventKey LIMIT 1',
    { eventKey }
  );
  return rows[0] || null;
}

async function upsert(eventKey, { description, emailEnabled, smsEnabled, updatedBy }) {
  const existing = await findByEventKey(eventKey);

  if (existing) {
    const updates = { updated_by: updatedBy };
    if (description !== undefined) updates.description = description;
    if (emailEnabled !== undefined) updates.email_enabled = emailEnabled;
    if (smsEnabled !== undefined) updates.sms_enabled = smsEnabled;

    const setClauses = Object.keys(updates).map((key) => `${key} = :${key}`);
    await pool.query(
      `UPDATE system_notification_settings SET ${setClauses.join(', ')} WHERE event_key = :eventKey`,
      { ...updates, eventKey }
    );
  } else {
    await pool.query(
      `INSERT INTO system_notification_settings (event_key, description, email_enabled, sms_enabled, updated_by)
       VALUES (:eventKey, :description, :emailEnabled, :smsEnabled, :updatedBy)`,
      {
        eventKey,
        description: description || null,
        emailEnabled: emailEnabled ?? true,
        smsEnabled: smsEnabled ?? false,
        updatedBy,
      }
    );
  }

  return findByEventKey(eventKey);
}

module.exports = { listAll, findByEventKey, upsert };
