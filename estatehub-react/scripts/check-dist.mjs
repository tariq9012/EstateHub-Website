// scripts/check-dist.mjs — runs after `vite build` (see package.json "build"). Fails the build if the production
// bundle contains a loopback API address, so a broken deployment can never ship silently.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath (not URL.pathname) so Windows drive letters and folders with spaces/%20 resolve correctly.
const DIST = fileURLToPath(new URL('../dist', import.meta.url));
const FORBIDDEN = [/localhost:5000/g, /127\.0\.0\.1:5000/g, /\[::1\]:5000/g];
const CONTEXT = 70; // characters of bundle text shown on each side of a match

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.(js|css|html|map)$/.test(name) ? [p] : [];
  });
}

// Bundle text is public build output, but keep the report short and single-line (no arbitrary environment values).
const oneLine = (text) => text.replace(/\s+/g, ' ');

const hits = [];
for (const file of walk(DIST)) {
  const text = readFileSync(file, 'utf8');
  for (const re of FORBIDDEN) {
    for (const m of text.matchAll(re)) {
      if (hits.length >= 10) break;
      const before = text.slice(0, m.index);
      const line = before.split('\n').length;
      const col = m.index - (before.lastIndexOf('\n') + 1) + 1;
      hits.push({
        where: `${file.slice(DIST.length + 1)}:${line}:${col}`,
        match: m[0],
        context: oneLine(text.slice(Math.max(0, m.index - CONTEXT), m.index + m[0].length + CONTEXT)),
      });
    }
  }
}

if (hits.length) {
  console.error('\n[check-dist] FAILED: the production bundle references a local API address.');
  for (const h of hits) console.error(`  - ${h.where}  "${h.match}"\n      ...${h.context}...`);
  // Non-secret build facts that explain the usual causes.
  console.error(`\n  build facts: NODE_ENV=${process.env.NODE_ENV || '(unset)'}, VITE_API_URL ${process.env.VITE_API_URL ? 'is set' : 'is not set'}, VERCEL=${process.env.VERCEL ? 'yes' : 'no'}`);
  console.error('  Likely causes: a dependency or source file that embeds the address (see the context above); or the build ran with a');
  console.error('  non-production NODE_ENV. Production must call the same-origin /api. Fix the cause and rebuild; do not edit this check.\n');
  process.exit(1);
}
console.log('[check-dist] OK: no localhost API address in the production bundle.');
