// src/middleware/trustedOrigin.js
//
// Cross-site CSRF guard for the cookie-authenticated endpoints (/auth/refresh, /auth/logout).
//
// When the frontend and API sit on different sites the refresh cookie must be SameSite=None, which means the
// browser attaches it to requests started by ANY website. The cookie only authorizes issuing a new access
// token (which a foreign page cannot read — CORS blocks that), but rotating/revoking sessions on someone's
// behalf is still unwanted. Browsers always send an Origin header on cross-origin POSTs, so we reject any
// request whose Origin is present and not on the allowlist. Same-origin / non-browser clients (no Origin) pass:
// they cannot be driven by a victim's browser, and still need the cookie or tokens.

const env = require('../config/env');
const { failure } = require('../utils/apiResponse');

function requireTrustedOrigin(req, res, next) {
  const origin = req.headers.origin;
  if (!origin || env.allowedOrigins.includes(origin)) return next();
  return failure(res, 'Request origin is not allowed.', 403);
}

module.exports = { requireTrustedOrigin };
