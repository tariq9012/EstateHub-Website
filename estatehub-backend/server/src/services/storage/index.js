// src/services/storage/index.js
//
// The only storage module controllers/routes import. It hides which driver is active:
//
//   STORAGE_DRIVER=local (default)  development: multer disk storage, '/uploads/...' references, unchanged.
//   STORAGE_DRIVER=r2               production/Vercel: Cloudflare R2, browser-direct uploads (see r2Driver.js).
//
// References stored in MySQL (existing VARCHAR(500) columns, no schema change):
//   '/uploads/<sub>/<file>'                  legacy/local file (still deleted/served correctly after switching to R2)
//   'https://<public host>/properties/..'    PUBLIC R2 object (listing photos, avatars)
//   'verification/<agentId>/<uuid>.pdf'      PRIVATE R2 object key (documents) — never a URL, never public
//
// Configuration is read from process.env lazily (not from config/env.js) so this module stays loadable
// in unit tests without dotenv/MySQL; config/env.js validates the same variables at server start-up.

const { createLocalDriver } = require('./localDriver');
const { createR2DriverFromConfig } = require('./r2Driver');
const { keyFromReference, parsePendingKey } = require('./keys');
const { getPolicy } = require('./policy');

const R2_REQUIRED = Object.freeze([
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_PUBLIC_BUCKET_NAME',
  'R2_PRIVATE_BUCKET_NAME',
  'R2_PUBLIC_BASE_URL',
]);

function driverName(env = process.env) {
  const v = String(env.STORAGE_DRIVER || 'local').trim().toLowerCase();
  return v === 'r2' ? 'r2' : 'local';
}

/** Which of the R2 variables are missing (names only — values are never read into messages). */
function r2MissingVars(env = process.env) {
  return R2_REQUIRED.filter((name) => !env[name] || String(env[name]).trim() === '');
}

function readR2Config(env = process.env) {
  const missing = r2MissingVars(env);
  if (missing.length) {
    const err = new Error(`Cloudflare R2 is not configured (missing: ${missing.join(', ')})`);
    err.statusCode = 503;
    throw err;
  }
  return {
    accountId: env.R2_ACCOUNT_ID.trim(),
    accessKeyId: env.R2_ACCESS_KEY_ID.trim(),
    secretAccessKey: env.R2_SECRET_ACCESS_KEY.trim(),
    publicBucket: env.R2_PUBLIC_BUCKET_NAME.trim(),
    privateBucket: env.R2_PRIVATE_BUCKET_NAME.trim(),
    publicBaseUrl: env.R2_PUBLIC_BASE_URL.trim().replace(/\/+$/, ''),
  };
}

const localDriver = createLocalDriver();
let cachedR2 = null;
let overrideR2 = null; // tests

function getR2Driver() {
  if (overrideR2) return overrideR2;
  if (!cachedR2) cachedR2 = createR2DriverFromConfig(readR2Config());
  return cachedR2;
}

/** Test seam: inject a fake R2 driver (or null to reset). */
function __setR2DriverForTests(driver) {
  overrideR2 = driver;
  cachedR2 = null;
}

/** 'direct' (browser PUTs to R2 via presigned URL) or 'multipart' (legacy multer pipeline). */
function getUploadMode(env = process.env) {
  return driverName(env) === 'r2' ? 'direct' : 'multipart';
}

function requireDirectDriver() {
  if (getUploadMode() !== 'direct') {
    const err = new Error('Direct uploads are not enabled (STORAGE_DRIVER is not r2).');
    err.statusCode = 409;
    throw err;
  }
  return getR2Driver();
}

/** Presigned PUT target for a new upload. Authorization/ownership must already have been checked by the caller. */
function createUploadTarget(args) {
  return requireDirectDriver().createUploadTarget(args);
}

/** Validates + promotes an uploaded pending object. Returns { key, reference, contentType, size }. */
function finalizeUpload(args) {
  return requireDirectDriver().finalizeUpload(args);
}

function deletePending(pendingKey) {
  return requireDirectDriver().deletePending(pendingKey);
}

/** Deletes whatever a stored reference points at (R2 object or legacy local file). Never throws. */
async function deleteByReference(reference) {
  try {
    if (typeof reference !== 'string' || !reference) return false;
    const key = keyFromReference(reference);
    if (key) {
      if (driverName() !== 'r2') return false; // an R2 reference but this process has no R2 access
      return await getR2Driver().deleteObject(key);
    }
    return await localDriver.deleteLocalReference(reference);
  } catch (err) {
    return false;
  }
}

/**
 * How an authorized caller may read a PRIVATE document (call only after the ownership/admin check):
 *   { type: 'file', path }                     legacy local file -> res.sendFile
 *   { type: 'signed-url', url, expiresInSeconds }   R2 -> short-lived presigned GET (never stored)
 *   null                                       not a private file we can serve
 */
async function getPrivateFileAccess(reference, { contentType } = {}) {
  if (typeof reference !== 'string' || !reference) return null;
  const key = keyFromReference(reference);
  if (key) {
    if (driverName() !== 'r2') return null;
    const signed = await getR2Driver().createPrivateReadUrl(key, { contentType });
    return signed ? { type: 'signed-url', url: signed.url, expiresInSeconds: signed.expiresInSeconds } : null;
  }
  const path = localDriver.resolveLocalReference(reference);
  return path ? { type: 'file', path } : null;
}

/** Readiness summary — never includes secrets or bucket names. deep=true also probes both buckets. */
async function checkReadiness({ deep = false } = {}) {
  const name = driverName();
  if (name !== 'r2') return { driver: 'local', configured: true, directUploads: false };
  const missing = r2MissingVars();
  const out = { driver: 'r2', configured: missing.length === 0, directUploads: true };
  if (missing.length) out.missing = missing; // variable NAMES only
  if (deep && missing.length === 0) {
    try {
      out.reachable = await getR2Driver().checkReachable();
    } catch (err) {
      out.reachable = { publicBucket: false, privateBucket: false };
    }
  }
  return out;
}

/** Validation used at server start-up (config/env.js): returns the list of problems, empty when fine. */
function validateStorageEnv(env = process.env) {
  if (driverName(env) !== 'r2') return [];
  const problems = r2MissingVars(env).map((n) => `${n} is required when STORAGE_DRIVER=r2`);
  if (!problems.length) {
    if (!/^https:\/\//i.test(env.R2_PUBLIC_BASE_URL.trim())) problems.push('R2_PUBLIC_BASE_URL must start with https://');
    if (env.R2_PUBLIC_BUCKET_NAME.trim() === env.R2_PRIVATE_BUCKET_NAME.trim()) {
      problems.push('R2_PUBLIC_BUCKET_NAME and R2_PRIVATE_BUCKET_NAME must be two different buckets (private documents must never share a public bucket)');
    }
  }
  return problems;
}

module.exports = {
  R2_REQUIRED,
  driverName,
  getUploadMode,
  r2MissingVars,
  readR2Config,
  validateStorageEnv,
  createUploadTarget,
  finalizeUpload,
  deletePending,
  deleteByReference,
  getPrivateFileAccess,
  checkReadiness,
  getR2Driver,
  getPolicy,
  parsePendingKey,
  __setR2DriverForTests,
};
