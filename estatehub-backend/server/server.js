// server.js
// Entry point: verifies the PostgreSQL connection, then starts the HTTP server.
// Run with: npm run dev   (or)   npm start

const env = require('./src/config/env');
const { testConnection } = require('./src/config/db');
const app = require('./src/app');

async function start() {
  // eslint-disable-next-line no-console
  console.log('[startup] Checking PostgreSQL connection...');
  const dbCheck = await testConnection();

  if (!dbCheck.ok) {
    // eslint-disable-next-line no-console
    console.error('[startup] Could not connect to PostgreSQL:', dbCheck.error);
    console.error(
      '[startup] Check DATABASE_URL in your .env file (Neon: Dashboard -> Connect -> connection string),\n' +
        '[startup] and make sure `npm run db:migrate` has been run against this database.'
    );
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log('[startup] PostgreSQL connection OK.');

  // Bind explicitly to 0.0.0.0 rather than leaving the host unspecified. Node's default
  // (unspecified host -> the IPv6 wildcard '::') left this server reachable at
  // http://localhost:PORT on some machines but refusing connections to 127.0.0.1:PORT on
  // others (observed on Windows/Node 24: 'localhost' resolved to '::1' and worked, while an
  // explicit 127.0.0.1 got ECONNREFUSED, because nothing was actually listening on the IPv4
  // interface). Binding to 0.0.0.0 makes both localhost and 127.0.0.1 work, and is also what
  // most hosting platforms/containers require to route external traffic to the process at all.
  app.listen(env.port, '0.0.0.0', () => {
    // eslint-disable-next-line no-console
    console.log(`[startup] EstateHub API listening on http://localhost:${env.port} (bound to 0.0.0.0)`);
    // eslint-disable-next-line no-console
    console.log(`[startup] Health check: http://localhost:${env.port}/api/health`);
  });
}

start();