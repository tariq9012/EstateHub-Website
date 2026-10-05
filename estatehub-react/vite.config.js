import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// WHERE THE BROWSER SENDS API REQUESTS — decided here, at build time, and never by import.meta.env.DEV/PROD or by a
// VITE_API_URL that production could inherit:
//   dev server (`vite` / `npm run dev` / `vercel dev`):  __DEV_API_BASE__ = VITE_API_URL from .env, else http://localhost:5000/api
//   production build (`vite build`):                     __DEV_API_BASE__ = ''  ->  src/api/apiClient.js falls back to the
//                                                         same-origin '/api' (Vercel Services routes /api/* to Express)
// The localhost address therefore exists only inside this config file (which is never bundled) and only for `serve`.
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  if (command === 'build') {
    // A production bundle compiled in a non-production NODE_ENV (e.g. a stray NODE_ENV=development copied into the
    // hosting environment variables) also ships React's slow development build. Say so loudly in the build log.
    if (process.env.NODE_ENV && process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn(`\n[estatehub] WARNING: building with NODE_ENV=${process.env.NODE_ENV}. Set NODE_ENV=production (or remove it) for this build.\n`);
    }
    return {
      plugins: [react()],
      define: { __DEV_API_BASE__: JSON.stringify('') },
    };
  }

  // ---- development only (command === 'serve') ----
  let apiOrigin = 'http://localhost:5000'; // local Express backend
  try {
    if (env.VITE_API_URL) {
      const parsed = new URL(env.VITE_API_URL, 'http://localhost');
      // A relative value such as /api (vercel dev) is same-origin: keep the local backend as the /uploads proxy target.
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(env.VITE_API_URL)) apiOrigin = parsed.origin;
    }
  } catch (err) {
    // keep the local development fallback
  }

  return {
    plugins: [react()],
    define: { __DEV_API_BASE__: JSON.stringify(env.VITE_API_URL || 'http://localhost:5000/api') },
    // Uploaded files (property photos, verification/renewal documents) stored as RELATIVE urls such as
    // /uploads/properties/<n>.jpg are served by the API; proxy them so they don't 404 on the dev origin.
    server: { proxy: { '/uploads': apiOrigin } },
  };
});
