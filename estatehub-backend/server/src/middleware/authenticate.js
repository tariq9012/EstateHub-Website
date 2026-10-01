// src/middleware/authenticate.js
// Verifies the Bearer access token on protected routes and attaches
// { userId, role } to req.user for downstream controllers/authorize().
//
// Also re-checks the account's CURRENT status in the database on every request (not just at
// login/refresh). Access tokens are short-lived (15m by default), but without this check a user
// suspended by an admin could keep using protected routes for up to that whole window on a token
// issued before the suspension — an admin's suspend action should take effect close to
// immediately, not "eventually". The extra query is one indexed primary-key lookup per request,
// which is an acceptable cost for closing that window on every protected route in the app.

const { verifyAccessToken } = require('../utils/jwt');
const userModel = require('../models/user.model');
const { failure } = require('../utils/apiResponse');

async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return failure(res, 'Authentication required', 401);
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    return failure(res, 'Invalid or expired access token', 401);
  }

  try {
    const user = await userModel.findById(payload.userId);
    if (!user || user.status !== 'active') {
      return failure(res, 'This account is no longer active', 401);
    }
    // Defensive, not currently reachable through any app feature (there is no role-change
    // endpoint today) — but req.user.role must always reflect the database, never a stale claim
    // from a token issued before the account's role could have changed by any means (including a
    // direct DB edit), so authorize()'s role checks stay genuinely server-authoritative.
    if (user.role !== payload.role) {
      return failure(res, 'Session is out of date. Please sign in again.', 401);
    }
    req.user = {
      userId: payload.userId,
      role: user.role,
    };
  } catch (err) {
    return next(err);
  }

  return next();
}

module.exports = authenticate;