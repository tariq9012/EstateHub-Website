// scripts/db-verify.js — read-only structural check of the database in DATABASE_URL. Changes nothing.
//   npm run db:verify
// Checks: all 29 tables exist, every foreign key / named CHECK / updated_at trigger / case-insensitive unique
// index is present, the identity columns are healthy, and reports row counts. Exit code 1 on any missing piece.

const { describeTarget, requireDatabaseUrl, createPool } = require('./lib/pgConnect');

const TABLES = [
  'users', 'property_types', 'amenities', 'locations', 'admin_users', 'agents', 'agent_profiles', 'user_profiles',
  'refresh_tokens', 'password_reset_tokens', 'user_notification_preferences', 'system_notification_settings',
  'properties', 'property_images', 'property_amenities', 'favorites', 'recently_viewed_properties',
  'property_comparisons', 'property_comparison_items', 'inquiries', 'license_renewals', 'verification_documents',
  'conversations', 'messages', 'appointments', 'agent_reviews', 'property_reviews', 'notifications', 'admin_action_log',
];
// Tables whose primary key is a generated identity (MySQL AUTO_INCREMENT). Exactly 26 of the 29 tables.
// The other three intentionally have NO identity column:
//   user_notification_preferences  PK = user_id          (1:1 with users; the key is the user's id)
//   property_amenities             PK = (property_id, amenity_id)            junction table
//   property_comparison_items      PK = (comparison_id, property_id)         junction table
const IDENTITY_TABLES = TABLES.filter((t) => !['user_notification_preferences', 'property_amenities', 'property_comparison_items'].includes(t));
const EXPECTED_FOREIGN_KEYS = 47; // 46 in schema.sql + 1 in the password_reset_tokens migration
const EXPECTED_TRIGGERS = 14;     // one per MySQL "ON UPDATE CURRENT_TIMESTAMP" column
const EXPECTED_UNIQUE_INDEXES = ['uq_users_email', 'uq_property_types_name', 'uq_amenities_name', 'uq_locations_area',
  'uq_agents_license_number', 'uq_system_notification_settings_event_key'];

async function main() {
  const url = requireDatabaseUrl();
  const pool = createPool(url);
  const problems = [];
  const ok = (m) => console.log(`  ok   ${m}`);
  const bad = (m) => { problems.push(m); console.log(`  FAIL ${m}`); };
  try {
    console.log(`[verify] target: ${describeTarget(url)}`);
    const q = async (sql, p) => (await pool.query(sql, p)).rows;

    const tables = new Set((await q("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")).map((r) => r.table_name));
    const missing = TABLES.filter((t) => !tables.has(t));
    missing.length ? bad(`missing tables: ${missing.join(', ')}`) : ok(`all ${TABLES.length} tables exist`);

    const [{ n: fks }] = await q("SELECT COUNT(*)::int AS n FROM pg_constraint c JOIN pg_namespace ns ON ns.oid = c.connamespace WHERE c.contype = 'f' AND ns.nspname = 'public'");
    fks === EXPECTED_FOREIGN_KEYS ? ok(`${fks} foreign keys`) : bad(`foreign keys: found ${fks}, expected ${EXPECTED_FOREIGN_KEYS}`);

    const [{ n: checks }] = await q("SELECT COUNT(*)::int AS n FROM pg_constraint c JOIN pg_namespace ns ON ns.oid = c.connamespace WHERE c.contype = 'c' AND c.conname LIKE 'chk\\_%' AND ns.nspname = 'public'");
    checks >= 23 ? ok(`${checks} named CHECK constraints (enums, rating 1-5, unsigned rules)`) : bad(`CHECK constraints: found ${checks}, expected at least 23`);

    const [{ n: triggers }] = await q("SELECT COUNT(*)::int AS n FROM pg_trigger t JOIN pg_class cl ON cl.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = cl.relnamespace WHERE NOT t.tgisinternal AND ns.nspname = 'public'");
    triggers === EXPECTED_TRIGGERS ? ok(`${triggers} updated_at triggers`) : bad(`triggers: found ${triggers}, expected ${EXPECTED_TRIGGERS}`);

    const idx = new Set((await q("SELECT indexname FROM pg_indexes WHERE schemaname = 'public'")).map((r) => r.indexname));
    const missIdx = EXPECTED_UNIQUE_INDEXES.filter((i) => !idx.has(i));
    missIdx.length ? bad(`missing unique indexes: ${missIdx.join(', ')}`) : ok('case-insensitive unique indexes present (email, license, names, locations)');

    const identityRows = await q("SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND is_identity = 'YES'");
    const identityFound = new Set(identityRows.map((r) => r.table_name));
    const identityMissing = IDENTITY_TABLES.filter((t) => !identityFound.has(t));
    const identityExtra = [...identityFound].filter((t) => !IDENTITY_TABLES.includes(t));
    if (identityMissing.length || identityExtra.length) {
      bad(`identity columns: missing on [${identityMissing.join(', ')}]; unexpected on [${identityExtra.join(', ')}]`);
    } else {
      ok(`${identityFound.size} identity (auto-increment) columns, on exactly the ${IDENTITY_TABLES.length} tables that had AUTO_INCREMENT in MySQL`);
    }

    // Sequence health: an identity sequence behind MAX(id) would make the next INSERT fail with a duplicate key.
    for (const row of await q("SELECT c.table_name, c.column_name FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.is_identity = 'YES'")) {
      const [{ seq }] = await q('SELECT pg_get_serial_sequence($1, $2) AS seq', [`public.${row.table_name}`, row.column_name]);
      const [{ max }] = await q(`SELECT COALESCE(MAX(${row.column_name}), 0)::bigint AS max FROM ${row.table_name}`);
      const [{ last, called }] = await q(`SELECT last_value::bigint AS last, is_called AS called FROM ${seq}`);
      const next = called ? Number(last) + 1 : Number(last);
      if (next <= Number(max)) bad(`${row.table_name}.${row.column_name}: next id ${next} <= max existing id ${max} (run the importer's sequence reset)`);
    }

    console.log('\n[verify] row counts:');
    for (const t of TABLES.filter((x) => tables.has(x))) {
      const [{ n }] = await q(`SELECT COUNT(*)::int AS n FROM ${t}`);
      console.log(`  ${t.padEnd(32)} ${n}`);
    }
  } finally {
    await pool.end();
  }
  if (problems.length) {
    console.error(`\n[verify] ${problems.length} problem(s) found.`);
    process.exitCode = 1;
  } else {
    console.log('\n[verify] structure OK.');
  }
}

main().catch((err) => {
  console.error(`[verify] ${err.message}`);
  process.exitCode = 1;
});
