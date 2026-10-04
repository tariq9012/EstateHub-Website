// scripts/import-mysql-data.js — ONE-TIME copy of the existing EstateHub MySQL data into Neon PostgreSQL.
//
//   # 1. schema first:   npm run db:migrate
//   # 2. rehearsal (DEFAULT, writes nothing permanent — everything is rolled back at the end):
//   npm run db:import-mysql
//   # 3. real run, only after the rehearsal printed "VERIFICATION PASSED":
//   npm run db:import-mysql -- --apply
//
// SOURCE (read-only):  MYSQL_SOURCE_URL=mysql://USER:PASSWORD@HOST:3306/DBNAME   (or the old DB_HOST/DB_PORT/DB_NAME/
//                      DB_USER/DB_PASSWORD variables from your existing .env). Only SELECT statements are ever sent to
//                      MySQL; the source database is never modified or dropped.
// TARGET (write):      DATABASE_URL (the Neon connection string).
//
// Guarantees
//  - Preserves primary keys, foreign keys, password hashes, token hashes, R2 URLs/keys and timestamps verbatim.
//  - Tables are copied in dependency order inside ONE target transaction: any error (including a foreign-key
//    violation from orphaned source rows) rolls everything back and names the table.
//  - Refuses to run if any target table already holds rows (it never overwrites or merges).
//  - After copying, compares per-table row counts and primary-key sums with MySQL, plus an MD5 over every
//    password hash; --apply commits only if ALL of them match.
//  - Identity sequences are advanced past the imported ids so new inserts don't collide.
//  - Credentials are never printed.
//
// mysql2 is used ONLY by this script (devDependency); the running API no longer depends on it.

require('dotenv').config();
const { describeTarget, requireDatabaseUrl, createPool } = require('./lib/pgConnect');

const APPLY = process.argv.includes('--apply');
const BATCH = 500;

// Dependency order (parents before children). pk = single-column primary key used for the checksum (null = composite).
const TABLES = [
  { name: 'users', pk: 'user_id' },
  { name: 'property_types', pk: 'type_id' },
  { name: 'amenities', pk: 'amenity_id' },
  { name: 'locations', pk: 'location_id' },
  { name: 'admin_users', pk: 'admin_id' },
  { name: 'agents', pk: 'agent_id' },
  { name: 'agent_profiles', pk: 'agent_profile_id' },
  { name: 'user_profiles', pk: 'profile_id' },
  { name: 'refresh_tokens', pk: 'token_id' },
  { name: 'password_reset_tokens', pk: 'reset_token_id', optional: true }, // added by migration 001 in MySQL; may not exist there
  { name: 'user_notification_preferences', pk: 'user_id' },
  { name: 'system_notification_settings', pk: 'setting_id' },
  { name: 'properties', pk: 'property_id' },
  { name: 'property_images', pk: 'image_id' },
  { name: 'property_amenities', pk: null },
  { name: 'favorites', pk: 'favorite_id' },
  { name: 'recently_viewed_properties', pk: 'view_id' },
  { name: 'property_comparisons', pk: 'comparison_id' },
  { name: 'property_comparison_items', pk: null },
  { name: 'inquiries', pk: 'inquiry_id' },
  { name: 'license_renewals', pk: 'renewal_id' },
  { name: 'verification_documents', pk: 'document_id' },
  { name: 'conversations', pk: 'conversation_id' },
  { name: 'messages', pk: 'message_id' },
  { name: 'appointments', pk: 'appointment_id' },
  { name: 'agent_reviews', pk: 'review_id' },
  { name: 'property_reviews', pk: 'review_id' },
  { name: 'notifications', pk: 'notification_id' },
  { name: 'admin_action_log', pk: 'log_id' },
];

function mysqlConfig() {
  const url = String(process.env.MYSQL_SOURCE_URL || '').trim();
  const common = { dateStrings: true, multipleStatements: false };
  if (url) {
    const u = new URL(url);
    return {
      ...common,
      host: u.hostname,
      port: Number(u.port) || 3306,
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace(/^\//, ''),
      ...(u.searchParams.get('ssl') === 'true' ? { ssl: { rejectUnauthorized: true } } : {}),
    };
  }
  const { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, DB_SSL } = process.env;
  if (!DB_HOST || !DB_NAME || !DB_USER) {
    console.error('[import] Set MYSQL_SOURCE_URL (mysql://USER:PASSWORD@HOST:3306/DBNAME) or the old DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD variables.');
    process.exit(1);
  }
  return {
    ...common,
    host: DB_HOST,
    port: Number(DB_PORT) || 3306,
    user: DB_USER,
    password: DB_PASSWORD || '',
    database: DB_NAME,
    ...(DB_SSL === 'true' ? { ssl: { rejectUnauthorized: true } } : {}),
  };
}

/** Converts one MySQL value to what PostgreSQL's column type expects. */
function convert(value, pgType) {
  if (value === null || value === undefined) return null;
  switch (pgType) {
    case 'boolean': return value === true || value === 1 || value === '1' || value === 'true';
    case 'jsonb':
    case 'json': return typeof value === 'string' ? value : JSON.stringify(value); // mysql2 already parsed JSON columns
    case 'timestamp with time zone': return `${value}+00`; // source session is pinned to UTC below
    default: return value; // timestamp (DATETIME, UTC digits), date, numeric, text ... are plain strings/numbers
  }
}

async function main() {
  // eslint-disable-next-line global-require
  const mysql = require('mysql2/promise');
  const targetUrl = requireDatabaseUrl();
  const cfg = mysqlConfig();
  const pg = createPool(targetUrl);
  const my = await mysql.createConnection(cfg);
  const client = await pg.connect();
  const problems = [];

  console.log(`[import] source (MySQL, read-only): ${cfg.host}:${cfg.port} / ${cfg.database}`);
  console.log(`[import] target (PostgreSQL):       ${describeTarget(targetUrl)}`);
  console.log(`[import] mode: ${APPLY ? 'APPLY (will commit if verification passes)' : 'REHEARSAL (everything is rolled back)'}\n`);

  try {
    await my.query("SET time_zone = '+00:00'");           // TIMESTAMP columns come back as UTC digits
    await my.query('SET SESSION group_concat_max_len = 1073741824');
    await my.query('SET SESSION TRANSACTION READ ONLY');
    await my.query('START TRANSACTION WITH CONSISTENT SNAPSHOT'); // one consistent view of the source for the whole copy

    const [srcTablesRaw] = await my.query('SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE()');
    const srcTables = new Set(srcTablesRaw.map((r) => String(r.t || r.T || Object.values(r)[0]).toLowerCase()));

    const { rows: tgtTables } = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    const tgt = new Set(tgtTables.map((r) => r.table_name));
    const missingTarget = TABLES.filter((t) => !tgt.has(t.name)).map((t) => t.name);
    if (missingTarget.length) throw new Error(`Target is missing tables (${missingTarget.join(', ')}). Run \`npm run db:migrate\` first.`);

    const missingSource = TABLES.filter((t) => !srcTables.has(t.name) && !t.optional).map((t) => t.name);
    if (missingSource.length) throw new Error(`Source MySQL database is missing expected tables: ${missingSource.join(', ')}. Is MYSQL_SOURCE_URL pointing at the right database?`);

    // Never overwrite: every target table must be empty.
    const nonEmpty = [];
    for (const t of TABLES) {
      const { rows } = await client.query(`SELECT 1 FROM ${t.name} LIMIT 1`);
      if (rows.length) nonEmpty.push(t.name);
    }
    if (nonEmpty.length) throw new Error(`Target tables are not empty (${nonEmpty.join(', ')}). The importer never merges into existing data. Use a fresh Neon database/branch, or empty it yourself first.`);

    await client.query('BEGIN');
    const report = [];

    for (const t of TABLES) {
      if (!srcTables.has(t.name)) {
        console.log(`[import] ${t.name.padEnd(32)} not present in MySQL (optional) — skipped`);
        report.push({ table: t.name, source: 0, target: 0, skipped: true });
        continue;
      }
      const { rows: cols } = await client.query(
        "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position",
        [t.name]
      );
      const names = cols.map((c) => c.column_name);
      const [srcCols] = await my.query('SELECT column_name AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?', [t.name]);
      const have = new Set(srcCols.map((r) => String(r.c || r.C || Object.values(r)[0]).toLowerCase()));
      const absent = names.filter((n) => !have.has(n));
      if (absent.length) throw new Error(`${t.name}: MySQL source has no column(s) ${absent.join(', ')}; its schema differs from database/schema.sql. Nothing was written.`);

      const [rows] = await my.query(`SELECT ${names.map((n) => `\`${n}\``).join(', ')} FROM \`${t.name}\`${t.pk ? ` ORDER BY \`${t.pk}\`` : ''}`);
      let copied = 0;
      try {
        for (let i = 0; i < rows.length; i += BATCH) {
          const chunk = rows.slice(i, i + BATCH);
          const params = [];
          const tuples = chunk.map((row) => `(${cols.map((c) => { params.push(convert(row[c.column_name], c.data_type)); return `$${params.length}`; }).join(', ')})`);
          const res = await client.query(`INSERT INTO ${t.name} (${names.join(', ')}) VALUES ${tuples.join(', ')}`, params);
          copied += res.rowCount;
        }
      } catch (err) {
        throw new Error(`${t.name}: copy failed after ${copied} row(s): ${err.message}${err.detail ? ` — ${err.detail}` : ''}. Everything was rolled back.`);
      }
      console.log(`[import] ${t.name.padEnd(32)} source ${String(rows.length).padStart(6)}   copied ${String(copied).padStart(6)}`);
      report.push({ table: t.name, source: rows.length, target: copied });
    }

    // ---- identity sequences: continue after the highest imported id ----
    for (const t of TABLES.filter((x) => x.pk)) {
      const { rows: [{ seq }] } = await client.query('SELECT pg_get_serial_sequence($1, $2) AS seq', [`public.${t.name}`, t.pk]);
      if (!seq) continue;
      await client.query(`SELECT setval($1, COALESCE((SELECT MAX(${t.pk}) FROM ${t.name}), 1), (SELECT MAX(${t.pk}) IS NOT NULL FROM ${t.name}))`, [seq]);
    }

    // ---- verification ----
    console.log('\n[import] verifying (MySQL vs PostgreSQL) ...');
    for (const t of TABLES) {
      if (!srcTables.has(t.name)) continue;
      const [[s]] = await my.query(`SELECT COUNT(*) AS n${t.pk ? `, COALESCE(SUM(\`${t.pk}\`), 0) AS idsum` : ''} FROM \`${t.name}\``);
      const { rows: [d] } = await client.query(`SELECT COUNT(*)::bigint AS n${t.pk ? `, COALESCE(SUM(${t.pk}), 0)::numeric AS idsum` : ''} FROM ${t.name}`);
      const countOk = Number(s.n) === Number(d.n);
      const sumOk = !t.pk || String(s.idsum) === String(d.idsum);
      if (!countOk) problems.push(`${t.name}: row count MySQL=${s.n} PostgreSQL=${d.n}`);
      if (!sumOk) problems.push(`${t.name}: primary-key sum MySQL=${s.idsum} PostgreSQL=${d.idsum}`);
      console.log(`  ${countOk && sumOk ? 'ok  ' : 'FAIL'} ${t.name.padEnd(32)} rows ${s.n} = ${d.n}${t.pk ? `   id-sum ${sumOk ? 'match' : 'MISMATCH'}` : ''}`);
    }
    // Credentials must be byte-identical: hash all password hashes and refresh-token hashes on both sides.
    for (const [table, pk, col] of [['users', 'user_id', 'password_hash'], ['refresh_tokens', 'token_id', 'token_hash']]) {
      const [[s]] = await my.query(`SELECT MD5(COALESCE(GROUP_CONCAT(\`${col}\` ORDER BY \`${pk}\` SEPARATOR ''), '')) AS h FROM \`${table}\``);
      const { rows: [d] } = await client.query(`SELECT md5(COALESCE(string_agg(${col}, '' ORDER BY ${pk}), '')) AS h FROM ${table}`);
      const ok = s.h === d.h;
      if (!ok) problems.push(`${table}.${col}: checksum differs between MySQL and PostgreSQL`);
      console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${`${table}.${col}`.padEnd(32)} checksum ${ok ? 'identical' : 'DIFFERENT'}`);
    }

    if (problems.length) {
      await client.query('ROLLBACK');
      console.error(`\n[import] VERIFICATION FAILED — rolled back, the target database was not changed:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
      process.exitCode = 1;
    } else if (!APPLY) {
      await client.query('ROLLBACK');
      console.log('\n[import] VERIFICATION PASSED (rehearsal). Nothing was committed. Re-run with --apply to commit this import.');
    } else {
      await client.query('COMMIT');
      console.log('\n[import] VERIFICATION PASSED and COMMITTED. The MySQL database was not touched; keep it until production is verified.');
    }
    console.log('[import] summary:', JSON.stringify(report.map((r) => ({ [r.table]: r.target }))).slice(0, 4000));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(`\n[import] ${err.message}`);
    process.exitCode = 1;
  } finally {
    await my.query('ROLLBACK').catch(() => {});
    await my.end().catch(() => {});
    client.release();
    await pg.end();
  }
}

main().catch((err) => {
  console.error(`[import] ${err.message}`);
  process.exitCode = 1;
});
