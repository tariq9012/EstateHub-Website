// src/services/storage/policy.js
//
// What each kind of stored file is allowed to be, and whether it may ever be public.
// This is the single source of truth shared by the presign step (declared type/size), the
// finalize step (real content + real size) and the legacy multipart path (utils/uploadSafety.js
// keeps the same MIME lists and limits).

const { IMAGE_MIMES, DOCUMENT_MIMES, FILE_TYPES } = require('../../utils/uploadSafety');

const MB = 1024 * 1024;

const KINDS = Object.freeze({
  'property-image': Object.freeze({
    prefix: 'properties',
    visibility: 'public', // listing photos are meant to be viewable by anyone
    mimes: IMAGE_MIMES,
    maxBytes: 5 * MB,
    maxPerRequest: 20,
  }),
  avatar: Object.freeze({
    prefix: 'avatars',
    visibility: 'public',
    mimes: IMAGE_MIMES,
    maxBytes: 2 * MB,
    maxPerRequest: 1,
  }),
  'verification-document': Object.freeze({
    prefix: 'verification',
    visibility: 'private', // IDs / licences: never a permanent public URL
    mimes: DOCUMENT_MIMES,
    maxBytes: 10 * MB,
    maxPerRequest: 1,
  }),
  'renewal-document': Object.freeze({
    prefix: 'renewals',
    visibility: 'private',
    mimes: DOCUMENT_MIMES,
    maxBytes: 10 * MB,
    maxPerRequest: 1,
  }),
});

const PREFIX_TO_KIND = Object.freeze(
  Object.fromEntries(Object.entries(KINDS).map(([kind, p]) => [p.prefix, kind]))
);

function getPolicy(kind) {
  const policy = KINDS[kind];
  if (!policy) throw new Error(`Unknown storage kind: ${kind}`);
  return policy;
}

/** 'public' | 'private' for an object key's top-level prefix, or null if the prefix is unknown. */
function visibilityForPrefix(prefix) {
  const kind = PREFIX_TO_KIND[prefix];
  return kind ? KINDS[kind].visibility : null;
}

function extensionFor(mime) {
  const type = FILE_TYPES[mime];
  if (!type) return null;
  return type.ext; // '.jpg', '.png', ...
}

module.exports = { KINDS, PREFIX_TO_KIND, getPolicy, visibilityForPrefix, extensionFor };
