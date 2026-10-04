// STATIC guard: the runtime source must not contain MySQL-only SQL or driver idioms (they would fail or silently
// misbehave on PostgreSQL). This reads source text only; it does not execute SQL.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
  });
}

const FORBIDDEN = [
  [/require\(['"]mysql2?(\/promise)?['"]\)/, "mysql driver import"],
  [/\bON DUPLICATE KEY\b/i, 'ON DUPLICATE KEY (use ON CONFLICT)'],
  [/\bLAST_INSERT_ID\b/i, 'LAST_INSERT_ID (use RETURNING)'],
  [/\.insertId\b/, 'result.insertId (use RETURNING + rows[0])'],
  [/\.affectedRows\b/, 'result.affectedRows (use rowCount)'],
  [/\bER_DUP_ENTRY\b/, "ER_DUP_ENTRY (PostgreSQL SQLSTATE is '23505')"],
  [/\bFROM_UNIXTIME\b|\bUNIX_TIMESTAMP\b|\bUTC_TIMESTAMP\b/i, 'MySQL time functions'],
  [/\bDATE_ADD\s*\(|\bDATE_SUB\s*\(|\bTIMESTAMPDIFF\s*\(|\bDATEDIFF\s*\(|\bDATE_FORMAT\s*\(|\bCURDATE\s*\(/i, 'MySQL date functions'],
  [/\bIFNULL\s*\(|\bGROUP_CONCAT\s*\(|\bMATCH\s*\(.*\)\s*AGAINST\b/i, 'MySQL-only functions'],
  [/\bbeginTransaction\b|\bgetConnection\b/, 'mysql2 transaction API (use pool.withTransaction)'],
  [/\bLIKE\b/, 'bare LIKE is case-sensitive on PostgreSQL (use ILIKE)'],
  [/VALUES \?/, 'mysql2 bulk "VALUES ?" expansion'],
  [/\bSUM\(\s*\w+(\.\w+)?\s*(=|!=)/, 'SUM(boolean-expression) (use COUNT(*) FILTER (WHERE ...))'],
];

test('no MySQL-only constructs remain in src/', () => {
  const offenders = [];
  for (const file of walk(SRC)) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      const code = line.replace(/^\s*(\/\/|\*|\/\*).*/, ''); // ignore pure comment lines
      FORBIDDEN.forEach(([re, why]) => { if (re.test(code)) offenders.push(`${path.relative(SRC, file)}:${i + 1} ${why}: ${line.trim().slice(0, 90)}`); });
    });
  }
  assert.deepEqual(offenders, []);
});

test('every camelCase SQL alias is double-quoted (PostgreSQL lower-cases unquoted identifiers)', () => {
  const offenders = [];
  for (const file of walk(path.join(SRC, 'models'))) {
    fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, i) => {
      if (/^\s*(\/\/|\*)/.test(line)) return;
      if (/\bAS\s+[a-z]+[A-Z]\w*/.test(line)) offenders.push(`${path.basename(file)}:${i + 1} ${line.trim().slice(0, 90)}`);
    });
  }
  assert.deepEqual(offenders, []);
});
