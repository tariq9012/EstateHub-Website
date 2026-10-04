// scripts/db-migrate.js — applies database/postgres/migrations/*.sql to the database in DATABASE_URL.
//
//   npm run db:migrate              apply every migration not yet recorded in schema_migrations
//   npm run db:migrate -- --status  only list applied / pending migrations
//
// - Each migration file runs in ONE transaction: it either fully applies or leaves the database untouched.
// - Applied files are recorded (name + sha256). A file that was edited after being applied is reported and the run
//   stops (write a NEW numbered migration instead of editing an applied one).
// - A PostgreSQL advisory lock stops two people/CI jobs migrating at the same time.
// - It never drops anything, and the running API never calls it.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DB_ROOT, describeTarget, requireDatabaseUrl, createPool } = require('./lib/pgConnect');

const MIGRATIONS_DIR = path.join(DB_ROOT, 'migrations');
const LOCK_KEY = 727001; // arbitrary app-specific advisory-lock id
const STATUS_ONLY = process.argv.includes('--status');

async function main() {
  const url = requireDatabaseUrl();
  const pool = createPool(url);
  const client = await pool.connect();
  try {
    console.log(`[migrate] target: ${describeTarget(url)}`);
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
    if (files.length === 0) throw new Error(`No migration files found in ${MIGRATIONS_DIR}`);

    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name        TEXT PRIMARY KEY,
      checksum    TEXT NOT NULL,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    const { rows } = await client.query('SELECT name, checksum FROM schema_migrations');
    const applied = new Map(rows.map((r) => [r.name, r.checksum]));

    let ran = 0;
    for (const file of files) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');
      if (applied.has(file)) {
        if (applied.get(file) !== checksum) {
          throw new Error(`${file} was already applied but its contents have changed since. Do not edit applied migrations; add a new one.`);
        }
        console.log(`[migrate] applied   ${file}`);
        continue;
      }
      if (STATUS_ONLY) {
        console.log(`[migrate] PENDING   ${file}`);
        continue;
      }
      console.log(`[migrate] applying  ${file} ...`);
      try {
        await client.query('BEGIN');
        await client.query(sql); // multi-statement script via the simple-query protocol
        await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [file, checksum]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(`${file} failed and was rolled back: ${err.message}`);
      }
      ran += 1;
      console.log(`[migrate] done      ${file}`);
    }
    console.log(STATUS_ONLY ? '[migrate] status only; nothing changed.' : `[migrate] finished; ${ran} migration(s) applied.`);
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`[migrate] ${err.message}`);
  process.exitCode = 1;
});
