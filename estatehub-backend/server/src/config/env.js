// src/config/env.js
// Loads and validates environment variables. Fails fast (with a clear
// message) if anything required for the app to run safely is missing.

require('dotenv').config();

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

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,

  db: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },

  cookie: {
    secure: process.env.COOKIE_SECURE === 'true',
    domain: process.env.COOKIE_DOMAIN || 'localhost',
  },

  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',

  // Where password-reset links point to. Falls back to clientOrigin so existing local setups keep
  // working without any new configuration — but production should set FRONTEND_URL explicitly so
  // this never silently resolves to a dev URL.
  frontendUrl: process.env.FRONTEND_URL || process.env.CLIENT_ORIGIN || 'http://localhost:5173',

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