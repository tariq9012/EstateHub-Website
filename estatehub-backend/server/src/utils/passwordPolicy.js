// src/utils/passwordPolicy.js
// ONE password policy, reused by register and reset-password (and any future password-change
// endpoint) so frontend/backend and different flows never drift apart. Backend is authoritative —
// the frontend mirrors this only for UX (instant feedback), never as the real check.
//
// This keeps the existing register policy exactly as it was (min 8 chars) rather than silently
// strengthening or weakening it — see the Auth Hardening phase audit notes.

const { body } = require('express-validator');

const MIN_LENGTH = 8;
const MAX_LENGTH = 128; // generous ceiling — just guards against absurd/DoS-y input, not a real limit

/** A reusable express-validator chain for a `field` of the request body. */
function passwordRule(field = 'password') {
  return body(field)
    .isLength({ min: MIN_LENGTH, max: MAX_LENGTH })
    .withMessage(`Password must be between ${MIN_LENGTH} and ${MAX_LENGTH} characters long`);
}

module.exports = { MIN_LENGTH, MAX_LENGTH, passwordRule };
