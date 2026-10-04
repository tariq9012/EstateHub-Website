// src/models/notification.model.js

const { pool } = require('../config/db');

async function create({ userId, type, title, body, relatedEntityType, relatedEntityId }) {
  const result = await pool.query(
    `INSERT INTO notifications (user_id, type, title, body, related_entity_type, related_entity_id)
     VALUES (:userId, :type, :title, :body, :relatedEntityType, :relatedEntityId) RETURNING notification_id`,
    {
      userId,
      type,
      title,
      body: body || null,
      relatedEntityType: relatedEntityType || null,
      relatedEntityId: relatedEntityId || null,
    }
  );
  return result.rows[0].notification_id;
}

async function listForUser(userId, { unreadOnly = false, limit = 30 } = {}) {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 100);
  const conditions = ['user_id = :userId'];
  const params = { userId };
  if (unreadOnly) conditions.push('is_read = FALSE');

  const { rows } = await pool.query(
    `SELECT * FROM notifications WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT ${safeLimit}`,
    params
  );
  return rows;
}

async function markAsRead(notificationId, userId) {
  const result = await pool.query(
    'UPDATE notifications SET is_read = TRUE WHERE notification_id = :notificationId AND user_id = :userId',
    { notificationId, userId }
  );
  return result.rowCount > 0;
}

async function markAllAsRead(userId) {
  await pool.query('UPDATE notifications SET is_read = TRUE WHERE user_id = :userId AND is_read = FALSE', {
    userId,
  });
}

async function countUnread(userId) {
  const { rows } = await pool.query(
    'SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = :userId AND is_read = FALSE',
    { userId }
  );
  return rows[0].cnt;
}

module.exports = { create, listForUser, markAsRead, markAllAsRead, countUnread };
