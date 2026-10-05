// Guards the frontend's API base: estatehub-react/vite.config.js, src/api/apiClient.js and scripts/check-dist.mjs.
// The frontend has no test runner of its own, so these live with the backend suite. vite.config.js is evaluated with
// stubbed `vite` / plugin imports (the real packages are not needed), so the config LOGIC is exercised for real.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

const REACT = path.join(__dirname, '..', '..', '..', 'estatehub-react');
const read = (...p) => fs.readFileSync(path.join(REACT, ...p), 'utf8').replace(/\r\n/g, '\n');

let seq = 0;
async function loadConfig(command, envFromFiles = {}, nodeEnv) {
  const src = read('vite.config.js')
    .replace(/^import .*$/gm, '')
    .replace('export default defineConfig(', 'export default (');
  const prelude = 'const defineConfig = (f) => f; const loadEnv = () => globalThis.__TEST_ENV__; const react = () => ({ name: "react" });\n';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vite cfg '));
  const file = path.join(dir, `cfg${seq += 1}.mjs`);
  fs.writeFileSync(file, prelude + src);
  globalThis.__TEST_ENV__ = envFromFiles;
  const before = process.env.NODE_ENV;
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (m) => warnings.push(String(m));
  try {
    if (nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = nodeEnv;
    const mod = await import(pathToFileURL(file).href);
    return { config: mod.default({ command, mode: command === 'build' ? 'production' : 'development' }), warnings };
  } finally {
    console.warn = origWarn;
    if (before === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = before;
    delete globalThis.__TEST_ENV__;
  }
}

test('production build: __DEV_API_BASE__ is blanked and there is no proxy, whatever VITE_API_URL / env contain', async () => {
  for (const env of [{}, { VITE_API_URL: 'http://localhost:5000/api' }, { VITE_API_URL: 'https://x.example/api' }, { VITE_API_URL: '/api' }]) {
    const { config } = await loadConfig('build', env, 'production');
    assert.equal(config.define.__DEV_API_BASE__, '""', JSON.stringify(env));
    assert.equal(config.server, undefined);
    assert.ok(!JSON.stringify(config).includes('localhost'), 'no localhost anywhere in the build config');
  }
});

test('dev server: defaults to the local backend, honours VITE_API_URL (incl. /api for vercel dev), proxies /uploads', async () => {
  let { config } = await loadConfig('serve', {});
  assert.equal(config.define.__DEV_API_BASE__, JSON.stringify('http://localhost:5000/api'));
  assert.deepEqual(config.server.proxy, { '/uploads': 'http://localhost:5000' });

  ({ config } = await loadConfig('serve', { VITE_API_URL: 'http://localhost:5000/api' }));
  assert.equal(config.define.__DEV_API_BASE__, JSON.stringify('http://localhost:5000/api'));

  ({ config } = await loadConfig('serve', { VITE_API_URL: 'http://localhost:7000/api' }));
  assert.deepEqual(config.server.proxy, { '/uploads': 'http://localhost:7000' });

  ({ config } = await loadConfig('serve', { VITE_API_URL: '/api' })); // vercel dev
  assert.equal(config.define.__DEV_API_BASE__, JSON.stringify('/api'));
  assert.deepEqual(config.server.proxy, { '/uploads': 'http://localhost:5000' });
});

test('a non-production NODE_ENV during a build only warns (and still yields the same-origin /api config)', async () => {
  const { config, warnings } = await loadConfig('build', {}, 'development');
  assert.equal(config.define.__DEV_API_BASE__, '""');
  assert.ok(warnings.some((w) => /NODE_ENV=development/.test(w)));
  assert.equal((await loadConfig('build', {}, 'production')).warnings.length, 0);
});

test('apiClient.js: BASE_URL is the compile-time constant or same-origin /api; no env/DEV dependence, no localhost literal', () => {
  const src = read('src', 'api', 'apiClient.js');
  assert.match(src, /^const BASE_URL = __DEV_API_BASE__ \|\| '\/api';$/m);
  const code = src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  assert.ok(!/localhost|127\.0\.0\.1|\[::1\]/.test(code), 'loopback literal in apiClient.js code');
  assert.ok(!/import\.meta\.env/.test(code), 'apiClient.js must not read import.meta.env');
  assert.ok(!/apiBase/.test(src), 'removed module still referenced');
  // the two values the build can inject resolve to the intended base
  const base = (injected) => new Function('__DEV_API_BASE__', `return ${'__DEV_API_BASE__ || \'/api\''};`)(injected);
  assert.equal(base(''), '/api');
  assert.equal(base('http://localhost:5000/api'), 'http://localhost:5000/api');
});

test('no production-reachable source references loopback addresses or VITE_API_URL', () => {
  const offenders = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(js|jsx|mjs|ts|tsx|html)$/.test(e.name)) continue;
      const code = fs.readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
      if (/localhost|127\.0\.0\.1|\[::1\]|VITE_API_URL/.test(code)) offenders.push(path.relative(REACT, p));
    }
  })(path.join(REACT, 'src'));
  assert.deepEqual(offenders, []);
  assert.ok(!/localhost|127\.0\.0\.1/.test(read('index.html')), 'index.html');
});

test('the build script still runs check-dist after vite build', () => {
  assert.equal(JSON.parse(read('package.json')).scripts.build, 'vite build && node scripts/check-dist.mjs');
});

test('check-dist.mjs passes a clean bundle; fails with file:line:col + context for each loopback form', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dist check '));
  fs.mkdirSync(path.join(tmp, 'scripts')); fs.mkdirSync(path.join(tmp, 'dist', 'assets'), { recursive: true });
  fs.copyFileSync(path.join(REACT, 'scripts', 'check-dist.mjs'), path.join(tmp, 'scripts', 'check-dist.mjs'));
  const run = () => spawnSync(process.execPath, [path.join(tmp, 'scripts', 'check-dist.mjs')], { encoding: 'utf8', env: { ...process.env, VITE_API_URL: 'super-secret-value' } });
  const bundle = path.join(tmp, 'dist', 'assets', 'index-abc.js');

  fs.writeFileSync(bundle, 'const a="/api";');
  const clean = run();
  assert.equal(clean.status, 0, clean.stderr);
  assert.match(clean.stdout, /\[check-dist\] OK/);

  for (const bad of ['http://localhost:5000/api', 'http://127.0.0.1:5000/api', 'http://[::1]:5000/api']) {
    fs.writeFileSync(bundle, `line one\nfoo();const BASE="${bad}";fetch(BASE+"/auth/login")\n`);
    const r = run();
    assert.equal(r.status, 1, bad);
    assert.match(r.stderr, /assets[\\/]index-abc\.js:2:/, 'reports file:line:col');
    assert.ok(r.stderr.includes('fetch(BASE+"/auth/login")'), 'shows surrounding bundle text');
    assert.match(r.stderr, /VITE_API_URL is set/);
    assert.ok(!r.stderr.includes('super-secret-value'), 'never prints environment values');
  }
});
