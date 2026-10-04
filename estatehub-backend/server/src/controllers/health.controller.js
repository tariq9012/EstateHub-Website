// src/controllers/health.controller.js

const crypto = require('node:crypto');
const { testConnection } = require('../config/db');
const { success, failure } = require('../utils/apiResponse');
const storage = require('../services/storage');
const { sharedStoreConfigured } = require('../middleware/rateLimiter');

/**
 * GET /api/health
 * Confirms the API process is up AND that it can reach PostgreSQL (Neon). (Unchanged contract.)
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

function tokenMatches(provided, expected) {
  const a = Buffer.from(String(provided || ''));
  const b = Buffer.from(String(expected || ''));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

/**
 * GET /api/health/ready
 * Deployment readiness: API alive, PostgreSQL reachable, storage configured, shared rate-limit store configured.
 * Reports booleans and variable NAMES only — never values. It does not touch R2 unless the caller proves it is
 * an operator by sending `x-health-token: <HEALTH_CHECK_TOKEN>` (when that variable is set) together with
 * `?deep=1`, which additionally probes both buckets (HeadBucket). Without a token it stays cheap and safe.
 */
async function getReadiness(req, res) {
  const dbCheck = await testConnection();
  const wantsDeep = req.query.deep === '1' || req.query.deep === 'true';
  const deepAllowed = wantsDeep && Boolean(process.env.HEALTH_CHECK_TOKEN) && tokenMatches(req.headers['x-health-token'], process.env.HEALTH_CHECK_TOKEN);

  const storageStatus = await storage.checkReadiness({ deep: deepAllowed });
  const storageOk = storageStatus.configured && (!storageStatus.reachable || (storageStatus.reachable.publicBucket && storageStatus.reachable.privateBucket));

  const payload = {
    api: 'ok',
    database: dbCheck.ok ? 'ok' : 'unreachable',
    storage: storageStatus,
    rateLimitStore: sharedStoreConfigured ? 'shared' : 'per-instance-memory',
    timestamp: new Date().toISOString(),
  };
  if (wantsDeep && !deepAllowed) payload.note = 'Deep storage probe requires a valid x-health-token.';

  if (!dbCheck.ok || !storageOk) {
    return failure(res, 'Not ready', 503, payload);
  }
  return success(res, payload, 200);
}

module.exports = { getHealth, getReadiness };
