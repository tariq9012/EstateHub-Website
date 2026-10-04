// scripts/check-dist.mjs — runs after `vite build` (see package.json "build"). Fails the build if the production
// bundle contains a loopback API address, so a broken deployment can never ship silently.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath (not URL.pathname) so Windows drive letters and folders with spaces/%20 resolve correctly.
const DIST = fileURLToPath(new URL('../dist', import.meta.url));
const FORBIDDEN = [/localhost:5000/, /127\.0\.0\.1:5000/, /\[::1\]:5000/];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.(js|css|html|map)$/.test(name) ? [p] : [];
  });
}

const offenders = [];
for (const file of walk(DIST)) {
  const text = readFileSync(file, 'utf8');
  for (const re of FORBIDDEN) if (re.test(text)) offenders.push(`${file.slice(DIST.length + 1)} contains ${re.source}`);
}

if (offenders.length) {
  console.error(`\n[check-dist] FAILED: the production bundle references a local API address:\n  - ${offenders.join('\n  - ')}`);
  console.error('Production must call the same-origin /api. Remove VITE_API_URL from the Vercel project environment variables and rebuild.\n');
  process.exit(1);
}
console.log('[check-dist] OK: no localhost API address in the production bundle.');
