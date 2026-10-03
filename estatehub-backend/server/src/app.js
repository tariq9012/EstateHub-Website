// src/app.js
// Builds the Express app: middleware, routes, error handling.
// Does NOT start listening — that's server.js's job (keeps app testable).

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const path = require('path');

const env = require('./config/env');
const routes = require('./routes');
const { apiLimiter } = require('./middleware/rateLimiter');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const storage = require('./services/storage');

const app = express();

// Behind Vercel's proxy (or any reverse proxy) the client IP arrives in X-Forwarded-For; see config/env.js.
if (env.trustProxy) app.set('trust proxy', env.trustProxy);

// --- Core middleware ---
app.use(helmet());
// CORS: only origins on the allowlist (CLIENT_ORIGIN / FRONTEND_URL / CORS_ALLOWED_ORIGINS) are ever echoed back.
// Requests with no Origin header (curl, server-to-server, same-origin) are not browser cross-origin calls and pass.
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || env.allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false); // no CORS headers -> the browser blocks the response
    },
    credentials: true, // allow httpOnly refresh-token cookie
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  morgan(env.nodeEnv === 'development' ? 'dev' : 'combined', {
    // Ignore noisy /socket.io/* polling requests from unrelated apps/tabs
    // hitting this port — EstateHub's backend doesn't use socket.io.
    skip: (req) => req.originalUrl.startsWith('/socket.io'),
  })
);

// --- Static file serving ---
// Property photos and avatars are meant to be public, so those two subfolders are served directly.
// Verification/license-renewal documents are sensitive (IDs, licenses, insurance) and are
// deliberately NOT mounted here — they are only reachable through the authenticated,
// ownership-checked route GET /api/verification/documents/:documentId/file.
// Only mounted for the local development driver. With STORAGE_DRIVER=r2 public images are served by R2 itself
// and nothing is read from (or written to) the local disk.
if (storage.getUploadMode() === 'multipart') {
  app.use('/uploads/properties', express.static(path.join(__dirname, '..', 'uploads', 'properties')));
  app.use('/uploads/avatars', express.static(path.join(__dirname, '..', 'uploads', 'avatars')));
}

// --- Routes ---
// All feature routers are mounted inside src/routes/index.js and added
// there progressively (Phase 4 = auth/users, Phase 5 = properties, ...).
app.use('/api', apiLimiter, routes);

// --- 404 + error handling (must be last) ---
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;