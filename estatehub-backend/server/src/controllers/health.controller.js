// src/controllers/health.controller.js

const { testConnection } = require('../config/db');
const { success, failure } = require('../utils/apiResponse');

/**
 * GET /api/health
 * Confirms the API process is up AND that it can reach MySQL.
 */
async function getHealth(req, res) {
  const dbCheck = await testConnection();

  const payload = {
    api: 'ok',
    database: dbCheck.ok ? 'ok' : 'unreachable',
    timestamp: new Date().toISOString(),
  };

  if (!dbCheck.ok) {
    payload.databaseError = dbCheck.error;
    return failure(res, 'API is running but the database is unreachable', 503, payload);
  }

  return success(res, payload, 200);
}

module.exports = { getHealth };