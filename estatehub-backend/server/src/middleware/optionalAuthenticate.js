// src/middleware/optionalAuthenticate.js
// Like authenticate, but never blocks the request — if a valid Bearer token
// is present, req.user is set; otherwise the request just continues as
// anonymous. Used on routes that are public but behave differently for a
// logged-in owner/agent/admin (e.g. viewing a non-active property).
//
// Mirrors authenticate.js's account-status re-check (see that file's comment for why): a
// suspended user's still-valid token must fall back to anonymous treatment here too, rather than
// keep getting owner/agent/admin-only privileges on these "public but privileged-if-logged-in"
// routes.

const { verifyAccessToken } = require('../utils/jwt');
const userModel = require('../models/user.model');

async function optionalAuthenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme === 'Bearer' && token) {
    try {
      const payload = verifyAccessToken(token);
      const user = await userModel.findById(payload.userId);
      if (user && user.status === 'active' && user.role === payload.role) {
        req.user = { userId: payload.userId, role: user.role };
      }
      // Any other outcome (no such user, suspended/deactivated, stale role claim) — fall through
      // to anonymous, same as an invalid/expired token below.
    } catch (err) {
      // Invalid/expired token on an optional route — treat as anonymous.
    }
  }

  return next();
}

module.exports = optionalAuthenticate;