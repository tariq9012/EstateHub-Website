// src/models/adminActionLog.model.js

const { pool } = require('../config/db');

async function logAction({ adminId, actionType, targetType, targetId, notes }) {
  await pool.query(
    `INSERT INTO admin_action_log (admin_id, action_type, target_type, target_id, notes)
     VALUES (:adminId, :actionType, :targetType, :targetId, :notes)`,
    { adminId, actionType, targetType, targetId, notes: notes || null }
  );
}

module.exports = { logAction };