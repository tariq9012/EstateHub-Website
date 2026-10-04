import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { isLoopbackUrl } from './src/api/apiBase.js';

// Uploaded files (property photos, verification/renewal documents) are stored as RELATIVE urls such as
// /uploads/properties/<name>.jpg and served by the API. In development the app runs on a different
// origin than the API, so proxy /uploads to it — otherwise every uploaded image would 404 (and a direct
// cross-origin request would be blocked by the API's Cross-Origin-Resource-Policy header).
// In production, serve /uploads from the same origin as the app (reverse proxy) as well.
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  let apiOrigin = 'http://localhost:5000';
  try {
    if (env.VITE_API_URL) apiOrigin = new URL(env.VITE_API_URL).origin;
  } catch (err) {
    // keep the default
  }

  // PRODUCTION GUARD. A deployed site must call the same-origin /api, never the visitor's own machine. A loopback
  // VITE_API_URL (typically http://localhost:5000/api pasted into Vercel's environment variables from a local .env)
  // would be inlined into the bundle at build time, so blank it for production builds and say so in the build log.
  const define = {};
  if (command === 'build' && isLoopbackUrl(env.VITE_API_URL)) {
    // eslint-disable-next-line no-console
    console.warn(
      '\n[estatehub] VITE_API_URL points at localhost/loopback, which can never work in production. ' +
        'Ignoring it: the build will call the same-origin /api. Remove VITE_API_URL from your Vercel project settings.\n'
    );
    define['import.meta.env.VITE_API_URL'] = JSON.stringify('');
  }

  return {
    plugins: [react()],
    define,
    server: { proxy: { '/uploads': apiOrigin } },
  };
});
