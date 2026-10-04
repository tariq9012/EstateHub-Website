// src/api/apiBase.js
// Pure helpers that decide where the browser sends API requests. No imports, no Vite globals, so the logic is unit-testable.
//
//   production build : same-origin '/api' (Vercel Services routes /api/* to the Express service).
//                      A loopback VITE_API_URL (localhost / 127.x / ::1 / 0.0.0.0) is IGNORED, because a deployed site can
//                      never reach the visitor's own machine — that value can only be a leftover from local development.
//   development      : handled in apiClient.js (VITE_API_URL, else http://localhost:5000/api).

/** True for URLs that point at the machine the code runs on: localhost, *.localhost, 127.x.x.x, [::1], 0.0.0.0. */
export function isLoopbackUrl(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  let host;
  try {
    // A scheme-less value such as "localhost:5000/api" would parse as a protocol, so give it one for hostname extraction.
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`).hostname;
  } catch (err) {
    return false;
  }
  host = host.replace(/^\[|\]$/g, '').toLowerCase();
  return host === 'localhost' || host.endsWith('.localhost') || host === '::1' || host === '0.0.0.0' || /^127\.\d+\.\d+\.\d+$/.test(host);
}

/** API base for a PRODUCTION build: the configured value unless it is empty or loopback, then the same-origin '/api'. */
export function resolveProductionApiBase(configured) {
  const value = String(configured || '').trim();
  if (!value || isLoopbackUrl(value)) return '/api';
  return value;
}
