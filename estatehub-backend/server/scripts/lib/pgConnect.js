// scripts/lib/pgConnect.js
// Shared by the CLI database tools (db-migrate, db-seed, db-verify, import-mysql-data). These run on a developer
// machine or CI — NEVER inside the Vercel API — and deliberately do not load src/config/env.js (which also demands
// JWT/R2 settings that a schema tool does not need).
//
// Safety: the connection string is read from DATABASE_URL only, is never printed, and TLS is verified for any
// non-local host.

require('dotenv').config();
const path = require('node:path');
const { Pool } = require('pg');

const DB_ROOT = path.join(__dirname, '..', '..', '..', 'database', 'postgres');

/** Describes the target WITHOUT credentials, e.g. "ep-cool-1234-pooler.eu-central-1.aws.neon.tech / neondb". */
function describeTarget(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? `:${u.port}` : ''} / ${u.pathname.replace(/^\//, '')}`;
  } catch (err) {
    return '(unparseable DATABASE_URL)';
  }
}

function requireDatabaseUrl(envName = 'DATABASE_URL') {
  const url = String(process.env[envName] || '').trim();
  if (!url) {
    console.error(`[db] ${envName} is not set. Put your Neon connection string in estatehub-backend/server/.env (never commit it).`);
    process.exit(1);
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch (err) {
    console.error(`[db] ${envName} is not a valid URL (expected postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require).`);
    process.exit(1);
  }
  if (!/^postgres(ql)?:$/.test(parsed.protocol)) {
    console.error(`[db] ${envName} must start with postgresql:// (found "${parsed.protocol}//").`);
    process.exit(1);
  }
  return url;
}

function createPool(url) {
  const host = new URL(url).hostname;
  const local = /^(localhost|127\.0\.0\.1|\[?::1\]?)$/i.test(host);
  return new Pool({
    connectionString: url,
    max: 2,
    connectionTimeoutMillis: 15000,
    ...(local ? {} : { ssl: { rejectUnauthorized: true } }), // an explicit sslmode in the URL still takes precedence
    application_name: 'estatehub-cli',
  });
}

module.exports = { DB_ROOT, describeTarget, requireDatabaseUrl, createPool };
