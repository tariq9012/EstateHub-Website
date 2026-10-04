// scripts/db-seed.js — loads the reference data (property types, amenities, locations, notification settings) from
// database/postgres/seeds/*.sql. Every seed file is idempotent (ON CONFLICT DO NOTHING), so running it twice, or
// after importing your real MySQL data, never duplicates or overwrites anything.
//
// These are the same rows as the MySQL seeds. The repo contains no seeded user accounts/passwords, so none are created.

const fs = require('node:fs');
const path = require('node:path');
const { DB_ROOT, describeTarget, requireDatabaseUrl, createPool } = require('./lib/pgConnect');

const SEEDS_DIR = path.join(DB_ROOT, 'seeds');

async function main() {
  const url = requireDatabaseUrl();
  const pool = createPool(url);
  const client = await pool.connect();
  try {
    console.log(`[seed] target: ${describeTarget(url)}`);
    const files = fs.readdirSync(SEEDS_DIR).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
    for (const file of files) {
      const sql = fs.readFileSync(path.join(SEEDS_DIR, file), 'utf8');
      try {
        await client.query('BEGIN');
        const res = await client.query(sql);
        await client.query('COMMIT');
        const inserted = (Array.isArray(res) ? res : [res]).reduce((n, r) => n + (r.rowCount || 0), 0);
        console.log(`[seed] ${file}: ${inserted} row(s) inserted (existing rows skipped)`);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(`${file} failed and was rolled back: ${err.message}. Has \`npm run db:migrate\` been run?`);
      }
    }
    console.log('[seed] finished.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`[seed] ${err.message}`);
  process.exitCode = 1;
});
