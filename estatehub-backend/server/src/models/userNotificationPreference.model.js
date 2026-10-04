// src/models/userNotificationPreference.model.js

const { pool } = require('../config/db');

async function getOrCreateDefaults(userId) {
  const { rows } = await pool.query(
    'SELECT * FROM user_notification_preferences WHERE user_id = :userId LIMIT 1',
    { userId }
  );
  if (rows[0]) return rows[0];

  await pool.query('INSERT INTO user_notification_preferences (user_id) VALUES (:userId)', { userId });
  const { rows: created } = await pool.query(
    'SELECT * FROM user_notification_preferences WHERE user_id = :userId LIMIT 1',
    { userId }
  );
  return created[0];
}

async function update(userId, fields) {
  await getOrCreateDefaults(userId); // ensure the row exists before updating it

  const allowed = ['email_notifications', 'sms_notifications', 'push_notifications'];
  const data = {};
  Object.entries(fields).forEach(([key, value]) => {
    if (allowed.includes(key) && value !== undefined) data[key] = value;
  });

  if (Object.keys(data).length > 0) {
    const setClauses = Object.keys(data).map((key) => `${key} = :${key}`);
    await pool.query(
      `UPDATE user_notification_preferences SET ${setClauses.join(', ')} WHERE user_id = :userId`,
      { ...data, userId }
    );
  }

  const { rows } = await pool.query(
    'SELECT * FROM user_notification_preferences WHERE user_id = :userId LIMIT 1',
    { userId }
  );
  return rows[0];
}

module.exports = { getOrCreateDefaults, update };
