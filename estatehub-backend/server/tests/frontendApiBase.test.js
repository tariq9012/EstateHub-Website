// Guards the frontend's production API base (estatehub-react/src/api/apiBase.js, vite.config.js, apiClient.js).
// The frontend has no test runner of its own, so these live with the backend suite; they only read/import plain files.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REACT = path.join(__dirname, '..', '..', '..', 'estatehub-react');
const load = () => import(pathToFileURL(path.join(REACT, 'src', 'api', 'apiBase.js')).href);

test('production base: empty/unset -> same-origin /api', async () => {
  const { resolveProductionApiBase } = await load();
  for (const v of [undefined, null, '', '   ']) assert.equal(resolveProductionApiBase(v), '/api');
});

test('production base: every loopback VITE_API_URL is ignored -> /api', async () => {
  const { resolveProductionApiBase, isLoopbackUrl } = await load();
  for (const v of ['http://localhost:5000/api', 'https://localhost/api', 'localhost:5000/api', 'http://127.0.0.1:5000/api',
    'http://127.1.2.3/api', 'http://[::1]:5000/api', 'http://0.0.0.0:5000/api', 'http://api.localhost:5000/api']) {
    assert.equal(isLoopbackUrl(v), true, v);
    assert.equal(resolveProductionApiBase(v), '/api', v);
  }
});

test('production base: /api and real hosts are kept; lookalike hostnames are not treated as loopback', async () => {
  const { resolveProductionApiBase, isLoopbackUrl } = await load();
  assert.equal(resolveProductionApiBase('/api'), '/api');
  assert.equal(resolveProductionApiBase('https://api.example.com/api'), 'https://api.example.com/api');
  for (const v of ['https://notlocalhost.com/api', 'https://localhost.example.com/api', 'https://127.0.0.1.example.com/api']) {
    assert.equal(isLoopbackUrl(v), false, v);
  }
});

test('apiClient.js: the localhost literal is only reachable under import.meta.env.DEV, production uses resolveProductionApiBase', () => {
  const src = fs.readFileSync(path.join(REACT, 'src', 'api', 'apiClient.js'), 'utf8').replace(/\r\n/g, '\n');
  assert.match(src, /import \{ resolveProductionApiBase \} from '\.\/apiBase\.js';/);
  assert.match(src, /const BASE_URL = import\.meta\.env\.DEV\n\s+\? \(import\.meta\.env\.VITE_API_URL \|\| 'http:\/\/localhost:5000\/api'\)\n\s+: resolveProductionApiBase\(import\.meta\.env\.VITE_API_URL\);/);
  assert.equal((src.match(/localhost:5000\/api'/g) || []).length, 1, 'only one code occurrence of the dev URL');
});

test('no other source file hardcodes a localhost API URL', () => {
  const offenders = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|jsx|mjs)$/.test(e.name) && !p.endsWith(path.join('api', 'apiClient.js')) && /localhost:5000|127\.0\.0\.1:5000/.test(fs.readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join('\n'))) offenders.push(path.relative(REACT, p));
    }
  })(path.join(REACT, 'src'));
  assert.deepEqual(offenders, []);
});

test('vite.config.js blanks a loopback VITE_API_URL for builds, and the build runs the bundle check', () => {
  const cfg = fs.readFileSync(path.join(REACT, 'vite.config.js'), 'utf8');
  assert.match(cfg, /command === 'build' && isLoopbackUrl\(env\.VITE_API_URL\)/);
  assert.match(cfg, /define\['import\.meta\.env\.VITE_API_URL'\] = JSON\.stringify\(''\)/);
  const pkg = JSON.parse(fs.readFileSync(path.join(REACT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.build, 'vite build && node scripts/check-dist.mjs');
});

test('check-dist.mjs fails on a bundle containing localhost:5000 and passes on a clean one', () => {
  const { spawnSync } = require('node:child_process');
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dist check '));
  // copy the script next to a throwaway dist/ so it scans that instead of the real build output
  fs.mkdirSync(path.join(tmp, 'scripts')); fs.mkdirSync(path.join(tmp, 'dist', 'assets'), { recursive: true });
  fs.copyFileSync(path.join(REACT, 'scripts', 'check-dist.mjs'), path.join(tmp, 'scripts', 'check-dist.mjs'));
  fs.writeFileSync(path.join(tmp, 'dist', 'assets', 'index.js'), 'const a="/api";');
  const clean = spawnSync(process.execPath, [path.join(tmp, 'scripts', 'check-dist.mjs')], { encoding: 'utf8' });
  assert.equal(clean.status, 0, clean.stderr);
  fs.writeFileSync(path.join(tmp, 'dist', 'assets', 'index.js'), 'const a="http://localhost:5000/api";');
  const dirty = spawnSync(process.execPath, [path.join(tmp, 'scripts', 'check-dist.mjs')], { encoding: 'utf8' });
  assert.equal(dirty.status, 1);
  assert.match(dirty.stderr, /localhost:5000/);
});
