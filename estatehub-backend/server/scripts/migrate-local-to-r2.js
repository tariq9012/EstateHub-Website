// scripts/migrate-local-to-r2.js
//
// ONE-TIME, MANUAL migration of existing local uploads (./uploads) to Cloudflare R2.
//
//   npm run storage:migrate-r2              dry run (default): lists what WOULD be uploaded, changes nothing
//   npm run storage:migrate-r2 -- --apply   uploads, after you type MIGRATE (or pass --yes to skip the prompt)
//
// Safety:
//   * never runs automatically; nothing imports this file
//   * only touches rows whose reference still starts with '/uploads/' (already-migrated rows are skipped, so it is
//     safe to re-run), and uploads the SAME local file only once
//   * file content is re-validated (magic bytes) against the policy for its kind before upload
//   * the database row is updated ONLY after R2 accepted the object, with a compare-and-set on the old value
//   * local originals are NEVER deleted
//   * logs row ids and R2 keys only — never credentials
//
// To apply you need STORAGE_DRIVER=r2 and the R2_* variables in your environment/.env, plus the database variables.
// Point DB_* at the database that holds the rows you want to migrate (e.g. the hosted production DB), and run this
// from the machine that still has the ./uploads files.

const fs = require('node:fs');
const readline = require('node:readline');

const { pool } = require('../src/config/db');
const storage = require('../src/services/storage');
const { buildFinalKey } = require('../src/services/storage/keys');
const { getPolicy } = require('../src/services/storage/policy');
const { UPLOAD_ROOT } = require('../src/config/paths');
const { resolveStoredFile, detectMimeFromBuffer } = require('../src/utils/uploadSafety');

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const ASSUME_YES = args.has('--yes');

// Where each reference lives and which owner id its key is namespaced under.
const SOURCES = [
  { label: 'property photos', kind: 'property-image', table: 'property_images', idCol: 'image_id', refCol: 'image_url', ownerCol: 'property_id' },
  { label: 'verification/renewal documents', kind: 'verification-document', table: 'verification_documents', idCol: 'document_id', refCol: 'file_url', ownerCol: 'agent_id', kindFor: (row) => (row.renewal_id ? 'renewal-document' : 'verification-document'), extraCols: ['renewal_id'] },
  { label: 'avatars', kind: 'avatar', table: 'users', idCol: 'user_id', refCol: 'avatar_url', ownerCol: 'user_id' },
];

function confirm() {
  if (ASSUME_YES) return Promise.resolve(true);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question('This will upload local files to Cloudflare R2 and update database rows. Type MIGRATE to continue: ', (answer) => {
      rl.close();
      resolve(answer.trim() === 'MIGRATE');
    });
  });
}

function readHead(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(16);
    const n = fs.readSync(fd, buf, 0, 16, 0);
    return buf.subarray(0, n);
  } finally {
    fs.closeSync(fd);
  }
}

async function main() {
  console.log(`[migrate] mode: ${APPLY ? 'APPLY' : 'DRY RUN (no changes will be made)'}`);
  if (APPLY && storage.driverName() !== 'r2') {
    console.error('[migrate] To apply, set STORAGE_DRIVER=r2 and the R2_* variables (see .env.example). Nothing was changed.');
    process.exitCode = 1;
    return;
  }
  if (APPLY) {
    const problems = storage.validateStorageEnv();
    if (problems.length) {
      console.error(`[migrate] R2 configuration problems:\n${problems.map((p) => `  - ${p}`).join('\n')}\nNothing was changed.`);
      process.exitCode = 1;
      return;
    }
  }

  const plan = [];
  const totals = { found: 0, missingFile: 0, rejected: 0, uploaded: 0, updated: 0, failed: 0, reused: 0 };

  for (const src of SOURCES) {
    const cols = [src.idCol, src.refCol, src.ownerCol, ...(src.extraCols || [])];
    const [rows] = await pool.query(
      `SELECT ${[...new Set(cols)].join(', ')} FROM ${src.table} WHERE ${src.refCol} LIKE '/uploads/%'`
    );
    console.log(`[migrate] ${src.label}: ${rows.length} row(s) still pointing at local files`);
    rows.forEach((row) => plan.push({ src, row }));
  }
  totals.found = plan.length;

  if (plan.length === 0) {
    console.log('[migrate] Nothing to migrate.');
    return;
  }
  if (APPLY && !(await confirm())) {
    console.log('[migrate] Cancelled. Nothing was changed.');
    return;
  }

  const uploadedByLocalRef = new Map(); // same local file referenced twice -> one R2 object

  for (const { src, row } of plan) {
    const oldRef = row[src.refCol];
    const kind = src.kindFor ? src.kindFor(row) : src.kind;
    const tag = `${src.table}.${src.idCol}=${row[src.idCol]}`;
    const abs = resolveStoredFile(UPLOAD_ROOT, oldRef);
    if (!abs || !fs.existsSync(abs)) {
      totals.missingFile += 1;
      console.warn(`[migrate] SKIP ${tag}: local file not found (${oldRef})`);
      continue;
    }
    const mime = detectMimeFromBuffer(readHead(abs));
    if (!mime || !getPolicy(kind).mimes.includes(mime)) {
      totals.rejected += 1;
      console.warn(`[migrate] SKIP ${tag}: content is not an allowed ${kind} type`);
      continue;
    }

    if (!APPLY) {
      console.log(`[migrate] would upload ${tag}  ${oldRef}  ->  ${kind} (${mime})`);
      continue;
    }

    try {
      let newRef = uploadedByLocalRef.get(`${kind}:${oldRef}`);
      if (newRef) {
        totals.reused += 1;
      } else {
        const key = buildFinalKey(kind, row[src.ownerCol], mime);
        await storage.getR2Driver().putObject({ key, body: fs.readFileSync(abs), contentType: mime });
        newRef = storage.getR2Driver().referenceForKey(key);
        uploadedByLocalRef.set(`${kind}:${oldRef}`, newRef);
        totals.uploaded += 1;
        console.log(`[migrate] uploaded ${tag} -> ${key}`);
      }
      // Compare-and-set: only update if the row still holds the value we read.
      const [result] = await pool.query(
        `UPDATE ${src.table} SET ${src.refCol} = ? WHERE ${src.idCol} = ? AND ${src.refCol} = ?`,
        [newRef, row[src.idCol], oldRef]
      );
      if (result.affectedRows === 1) totals.updated += 1;
      else console.warn(`[migrate] ${tag}: row changed while migrating; left as is (the uploaded object is unreferenced)`);
    } catch (err) {
      totals.failed += 1;
      console.error(`[migrate] FAILED ${tag}: ${err.message}`);
    }
  }

  console.log('[migrate] summary:', JSON.stringify(totals));
  console.log('[migrate] Local files were NOT deleted. Verify the site, then remove ./uploads yourself if you wish.');
  if (totals.failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(`[migrate] fatal: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
