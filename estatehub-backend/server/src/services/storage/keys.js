// src/services/storage/keys.js
//
// Object keys for Cloudflare R2. Pure functions, no I/O, no SDK.
//
//   final key    properties/{propertyId}/{uuid}.jpg      verification/{agentId}/{uuid}.pdf
//   pending key  pending/{final key}                      (where a browser first uploads; promoted after validation)
//
// Rules:
//  * the file name is a random UUID; the extension comes from the validated MIME type — never from a
//    client-supplied file name (which is not used at all);
//  * the owner id must be a positive integer;
//  * a key is only ever accepted back from a client (or read from the database) if it matches the
//    STRICT pattern below, which cannot contain '..', '//', a leading '/', backslashes or other paths.

const crypto = require('node:crypto');
const { getPolicy, extensionFor, PREFIX_TO_KIND } = require('./policy');

const PREFIXES = Object.keys(PREFIX_TO_KIND);
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const EXT = '(?:jpg|png|webp|gif|pdf)';
const FINAL_KEY_RE = new RegExp(`^(${PREFIXES.join('|')})/([1-9][0-9]{0,15})/(${UUID})\\.(${EXT})$`);
const PENDING_PREFIX = 'pending/';

function keyError(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

function assertOwnerId(ownerId) {
  const n = Number(ownerId);
  if (!Number.isSafeInteger(n) || n < 1) throw keyError('Invalid owner id for storage key');
  return n;
}

/** Builds a NEW final key for a validated MIME type. */
function buildFinalKey(kind, ownerId, mime) {
  const policy = getPolicy(kind);
  const ext = extensionFor(mime);
  if (!ext || !policy.mimes.includes(mime)) throw keyError('Unsupported file type');
  return `${policy.prefix}/${assertOwnerId(ownerId)}/${crypto.randomUUID()}${ext}`;
}

/** The staging key for a final key. */
function toPendingKey(finalKey) {
  if (!FINAL_KEY_RE.test(finalKey)) throw keyError('Invalid storage key');
  return `${PENDING_PREFIX}${finalKey}`;
}

/** Parses a FINAL key. Returns { key, prefix, kind, ownerId, ext } or null. */
function parseFinalKey(key) {
  if (typeof key !== 'string') return null;
  const m = FINAL_KEY_RE.exec(key);
  if (!m) return null;
  return { key, prefix: m[1], kind: PREFIX_TO_KIND[m[1]], ownerId: Number(m[2]), ext: m[4] };
}

/** Parses a PENDING key (pending/<final key>). Returns the same shape (key = the pending key, finalKey added) or null. */
function parsePendingKey(key) {
  if (typeof key !== 'string' || !key.startsWith(PENDING_PREFIX)) return null;
  const finalKey = key.slice(PENDING_PREFIX.length);
  const parsed = parseFinalKey(finalKey);
  if (!parsed) return null;
  return { ...parsed, key, finalKey };
}

/**
 * Turns whatever the database holds into an R2 final key, or null if it is not one of ours:
 *   - a bare key                                  'verification/12/<uuid>.pdf'
 *   - a public URL on ANY host/path-prefix        'https://media.example.com/properties/5/<uuid>.jpg'
 * Legacy local references ('/uploads/...') return null. The host is deliberately not trusted or
 * compared: only the trailing key, which must match the strict pattern, is used — so changing the
 * public domain later never strands objects, and a crafted URL can never name an arbitrary object.
 */
function keyFromReference(reference) {
  if (typeof reference !== 'string' || reference.length === 0 || reference.length > 500) return null;
  if (FINAL_KEY_RE.test(reference)) return reference;
  if (!/^https?:\/\//i.test(reference)) return null;
  let pathname;
  try {
    pathname = new URL(reference).pathname;
  } catch (err) {
    return null;
  }
  const trimmed = pathname.replace(/^\/+/, '');
  // Allow an optional base path on the public URL (e.g. https://host/media/properties/...): the key is
  // the last three path segments.
  const parts = trimmed.split('/');
  if (parts.length < 3) return null;
  const candidate = parts.slice(-3).join('/');
  return FINAL_KEY_RE.test(candidate) ? candidate : null;
}

module.exports = {
  PENDING_PREFIX,
  buildFinalKey,
  toPendingKey,
  parseFinalKey,
  parsePendingKey,
  keyFromReference,
};
