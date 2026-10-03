// src/api/apiClient.js
// Thin fetch wrapper: injects the in-memory access token, sends the
// httpOnly refresh cookie automatically (credentials: 'include'), and
// transparently retries once via /auth/refresh if a request comes back 401.

// Where the API lives:
//   production  same origin, '/api' (Vercel Services routes /api/* to the Express service) — nothing to configure.
//   development VITE_API_URL from .env (e.g. http://localhost:5000/api); if unset, the local backend on port 5000.
// A VITE_API_URL set at build time still wins everywhere, e.g. to point a build at a different API host.
const BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000/api' : '/api');

let accessToken = null;
let onUnauthorized = null;
// Single-flight guard: if several requests 401 at nearly the same moment (e.g. a page that fires
// five requests right as the access token expires), they must all await the SAME /auth/refresh
// call rather than each firing their own. Concurrent refresh calls would each read the same
// not-yet-rotated refresh cookie, but only the first to reach the backend can actually use it —
// /auth/refresh revokes it on use, so every other concurrent call would come back "revoked" and
// wrongly trigger a logout even though the first call succeeded.
let inFlightRefresh = null;

function setAccessToken(token) {
  accessToken = token;
}

function getAccessToken() {
  return accessToken;
}

/** AuthContext registers a callback here to clear user state on a hard 401. */
function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

async function doRefresh() {
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return null;
    const body = await res.json();
    const token = body?.data?.accessToken || null;
    accessToken = token;
    return token;
  } catch (err) {
    return null;
  }
}

function refreshAccessToken() {
  if (!inFlightRefresh) {
    inFlightRefresh = doRefresh().finally(() => {
      inFlightRefresh = null;
    });
  }
  return inFlightRefresh;
}

async function request(path, { method = 'GET', body, headers = {}, isFormData = false, retry = true } = {}) {
  const finalHeaders = { ...headers };
  if (!isFormData) finalHeaders['Content-Type'] = 'application/json';
  if (accessToken) finalHeaders.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: finalHeaders,
    credentials: 'include',
    body: body !== undefined ? (isFormData ? body : JSON.stringify(body)) : undefined,
  });

  // Don't try to "refresh" the refresh/login/register calls themselves.
  const isAuthEndpoint = path.startsWith('/auth/refresh') || path.startsWith('/auth/login') || path.startsWith('/auth/register');

  if (res.status === 401 && retry && !isAuthEndpoint) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return request(path, { method, body, headers, isFormData, retry: false });
    }
    if (onUnauthorized) onUnauthorized();
  }

  let payload = null;
  try {
    payload = await res.json();
  } catch (err) {
    // No JSON body (e.g. 204) — leave payload null.
  }

  if (!res.ok) {
    const error = new Error(payload?.error || `Request failed with status ${res.status}`);
    error.status = res.status;
    error.details = payload?.details;
    throw error;
  }

  return payload?.data;
}

/**
 * Fetches a protected binary file (e.g. a verification document) as a blob object URL. The
 * browser won't attach the Authorization header to a plain <a href>/<img src>, and these files
 * are deliberately not on the public /uploads mount (see backend app.js) — so viewing them has to
 * go through the authenticated fetch path. Caller is responsible for URL.revokeObjectURL(url)
 * once done (e.g. when closing the preview modal).
 */
async function getBlobUrl(path) {
  const finalHeaders = {};
  if (accessToken) finalHeaders.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${BASE_URL}${path}`, { headers: finalHeaders, credentials: 'include' });
  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    try { message = (await res.json())?.error || message; } catch (err) { /* no JSON body */ }
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }
  // R2 mode: private documents are never streamed through the API (and are never public). The API answers with
  // JSON { data: { url } } — a short-lived presigned link — which we fetch WITHOUT credentials or our auth header.
  const type = res.headers.get('Content-Type') || '';
  if (type.includes('application/json')) {
    const signed = (await res.json())?.data;
    if (!signed?.url) throw new Error('The document link was not returned.');
    const fileRes = await fetch(signed.url);
    if (!fileRes.ok) throw new Error(`Could not load the document (status ${fileRes.status}).`);
    const fileBlob = await fileRes.blob();
    return { url: URL.createObjectURL(fileBlob), contentType: fileRes.headers.get('Content-Type') || fileBlob.type };
  }
  const blob = await res.blob();
  return { url: URL.createObjectURL(blob), contentType: type || blob.type };
}

export const api = {
  get: (path, opts) => request(path, { ...opts, method: 'GET' }),
  post: (path, body, opts) => request(path, { ...opts, method: 'POST', body }),
  put: (path, body, opts) => request(path, { ...opts, method: 'PUT', body }),
  delete: (path, opts) => request(path, { ...opts, method: 'DELETE' }),
  upload: (path, formData, opts) => request(path, { ...opts, method: 'POST', body: formData, isFormData: true }),
  getBlobUrl,
};

export { setAccessToken, getAccessToken, setUnauthorizedHandler, refreshAccessToken, BASE_URL };