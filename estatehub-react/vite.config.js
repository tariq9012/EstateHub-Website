import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Uploaded files (property photos, verification/renewal documents) are stored as RELATIVE urls such as
// /uploads/properties/<name>.jpg and served by the API. In development the app runs on a different
// origin than the API, so proxy /uploads to it — otherwise every uploaded image would 404 (and a direct
// cross-origin request would be blocked by the API's Cross-Origin-Resource-Policy header).
// In production, serve /uploads from the same origin as the app (reverse proxy) as well.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  let apiOrigin = 'http://localhost:5000';
  try {
    if (env.VITE_API_URL) apiOrigin = new URL(env.VITE_API_URL).origin;
  } catch (err) {
    // keep the default
  }
  return {
    plugins: [react()],
    server: { proxy: { '/uploads': apiOrigin } },
  };
});
