// src/config/env.js
// Loads and validates environment variables. Fails fast (with a clear
// message) if anything required for the app to run safely is missing.

require('dotenv').config();

const { validateStorageEnv, driverName } = require('../services/storage');

const required = [
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
];

const missing = required.filter((key) => !process.env[key] || process.env[key].trim() === '');

if (missing.length > 0) {
  // eslint-disable-next-line no-console
  console.error(
    `[env] Missing required environment variable(s): ${missing.join(', ')}\n` +
      '[env] Copy .env.example to .env and fill in real values before starting the server.'
  );
  process.exit(1);
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const onVercel = Boolean(process.env.VERCEL);

/** 'a, b ,c' -> ['a','b','c'] (blank entries dropped). */
function csv(value) {
  return String(value || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

/** Normalizes to a bare origin (scheme + host + port) so 'https://x.app/' and 'https://x.app' compare equal. */
function toOrigin(value) {
  try {
    return new URL(value).origin;
  } catch (err) {
    return null;
  }
}

// --- Browser origins that may call this API with credentials (CORS allowlist) ---
// CLIENT_ORIGIN is the existing variable (still works, and may now hold several comma-separated origins).
// FRONTEND_URL (also used for password-reset links) and CORS_ALLOWED_ORIGINS (extra preview/custom domains) are added.
// Nothing outside this list is ever echoed back, and '*' is never accepted.
const clientOrigins = csv(process.env.CLIENT_ORIGIN || (isProduction ? '' : 'http://localhost:5173'));
// Trailing slashes are stripped so links built as `${frontendUrl}/reset-password` never contain '//'.
const frontendUrl = (process.env.FRONTEND_URL || clientOrigins[0] || 'http://localhost:5173').trim().replace(/\/+$/, '');
const allowedOrigins = Array.from(
  new Set(
    [...clientOrigins, frontendUrl, ...csv(process.env.CORS_ALLOWED_ORIGINS)]
      .filter((v) => v !== '*')
      .map(toOrigin)
      .filter(Boolean)
  )
);

// --- Refresh-token cookie ---
// Same-site setups (localhost in dev, or app.example.com + api.example.com in production) use SameSite=Lax.
// A frontend and backend on two different *.vercel.app hosts are CROSS-site, so the cookie must be
// SameSite=None; Secure — see DEPLOYMENT.md for why a shared parent domain is strongly preferred.
const sameSiteRaw = String(process.env.COOKIE_SAMESITE || 'lax').trim().toLowerCase();
const cookieSameSite = ['lax', 'strict', 'none'].includes(sameSiteRaw) ? sameSiteRaw : 'lax';
const cookieSecure = process.env.COOKIE_SECURE === 'true';
const cookieDomain = process.env.COOKIE_DOMAIN || (isProduction ? undefined : 'localhost');

const problems = [...validateStorageEnv()];
if (cookieSameSite === 'none' && !cookieSecure) problems.push('COOKIE_SAMESITE=none requires COOKIE_SECURE=true');
if (isProduction) {
  if (!cookieSecure) problems.push('COOKIE_SECURE must be true in production');
  if (!process.env.FRONTEND_URL && !process.env.CLIENT_ORIGIN) problems.push('FRONTEND_URL (or CLIENT_ORIGIN) is required in production');
  if (String(process.env.JWT_ACCESS_SECRET).length < 32 || String(process.env.JWT_REFRESH_SECRET).length < 32) {
    problems.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must each be at least 32 characters in production');
  }
  if (process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET) {
    problems.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different values');
  }
}
if (problems.length > 0) {
  // eslint-disable-next-line no-console
  console.error(`[env] Invalid configuration:\n${problems.map((p) => `[env]  - ${p}`).join('\n')}`);
  process.exit(1);
}

const env = {
  nodeEnv,
  isProduction,
  onVercel,
  port: parseInt(process.env.PORT, 10) || 5000,

  // Behind Vercel's proxy the real client IP is in X-Forwarded-For. Without this, rate limiting would key every
  // visitor on the proxy's address. Override with TRUST_PROXY (a hop count such as 1, or 'false').
  trustProxy:
    process.env.TRUST_PROXY !== undefined
      ? (/^\d+$/.test(process.env.TRUST_PROXY) ? parseInt(process.env.TRUST_PROXY, 10) : process.env.TRUST_PROXY === 'true')
      : (onVercel ? 1 : false),

  db: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    // Every Vercel function instance holds its own pool, so keep it small there (local default stays 10).
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT, 10) || (onVercel ? 2 : 10),
    connectTimeoutMs: parseInt(process.env.DB_CONNECT_TIMEOUT_MS, 10) || 10000,
    // Managed MySQL (PlanetScale/Aiven/TiDB/RDS ...) normally requires TLS: DB_SSL=true. DB_SSL_CA may hold the
    // provider's CA certificate PEM (use \n for newlines). DB_SSL_REJECT_UNAUTHORIZED=false is an explicit opt-out.
    ssl: process.env.DB_SSL === 'true'
      ? {
          rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
          ...(process.env.DB_SSL_CA ? { ca: process.env.DB_SSL_CA.replace(/\\n/g, '\n') } : {}),
        }
      : undefined,
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },

  cookie: {
    secure: cookieSecure,
    domain: cookieDomain,
    sameSite: cookieSameSite,
  },

  clientOrigin: clientOrigins[0] || 'http://localhost:5173',
  allowedOrigins,

  // Where password-reset links point to. Production must set FRONTEND_URL explicitly (enforced above) so this never
  // silently resolves to a dev URL.
  frontendUrl,

  storage: {
    driver: driverName(),
  },

  // Optional — see utils/email.js. Left unset, the app runs fine; forgot-password emails just log
  // to the console in development instead of actually sending (see that file for the production
  // behavior, which never logs the reset link). Set GMAIL_USER/GMAIL_PASS to send real emails via
  // Gmail SMTP.
  email: {
    gmailUser: process.env.GMAIL_USER || '',
    gmailPass: process.env.GMAIL_PASS || '',
    from: process.env.EMAIL_FROM || 'EstateHub <no-reply@estatehub.example.com>',
  },
};

module.exports = env;
