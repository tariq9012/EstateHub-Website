// src/api/uploads.js
//
// One entry point for file uploads, used by api/properties.js, api/verification.js and api/licenseRenewals.js
// (so no page component had to change).
//
// The backend decides how files travel (GET /uploads/mode):
//   'multipart'  development: the file goes to the API as multipart/form-data (the original flow).
//   'direct'     production (Cloudflare R2): three steps — ask the API for a short-lived upload URL (the server
//                checks who you are and whether you may upload), PUT the bytes straight to R2, then tell the API
//                it is done (the server re-checks the real file content before saving anything).
//                Direct mode exists because Vercel functions reject request bodies over 4.5 MB.

import { api } from './apiClient';

let modePromise = null;

/** 'direct' | 'multipart'. Cached for the session; falls back to multipart if the API is unreachable. */
export function getUploadMode() {
  if (!modePromise) {
    modePromise = api
      .get('/uploads/mode')
      .then((data) => (data?.mode === 'direct' ? 'direct' : 'multipart'))
      .catch(() => {
        modePromise = null; // try again next time
        return 'multipart';
      });
  }
  return modePromise;
}

async function putToStorage(target, file) {
  let res;
  try {
    // No credentials/cookies and no Authorization header: the signed URL is the authorization.
    res = await fetch(target.uploadUrl, { method: 'PUT', headers: target.headers, body: file });
  } catch (err) {
    throw new Error('Could not reach file storage. Check your connection and try again.');
  }
  if (!res.ok) {
    throw new Error(
      res.status === 403
        ? 'The upload link was rejected or has expired. Please try again.'
        : `File storage rejected the upload (status ${res.status}).`
    );
  }
}

/**
 * Direct upload of one or more files. `basePath` is the same URL the multipart flow posts to, e.g.
 * '/properties/12/images'; `extra` carries non-file fields (e.g. { documentType }). Resolves with exactly what
 * the multipart endpoint would have returned.
 */
async function directUpload(basePath, files, extra = {}) {
  const presign = await api.post(`${basePath}/direct/presign`, {
    ...extra,
    files: files.map((f) => ({ contentType: f.type, size: f.size })),
  });
  const targets = presign?.uploads || [];
  if (targets.length !== files.length) throw new Error('The server did not return an upload target for every file.');
  await Promise.all(targets.map((target, i) => putToStorage(target, files[i])));
  return api.post(`${basePath}/direct/complete`, {
    ...extra,
    uploads: targets.map((target, i) => ({ key: target.key, contentType: files[i].type })),
  });
}

/** Property photos. `formData` holds the files under the field name "images". */
export async function uploadImages(basePath, formData) {
  if ((await getUploadMode()) === 'direct') return directUpload(basePath, formData.getAll('images'));
  return api.upload(basePath, formData);
}

/** A single document. `formData` holds "document" (the file) and "documentType". */
export async function uploadDocument(basePath, formData) {
  if ((await getUploadMode()) === 'direct') {
    return directUpload(basePath, [formData.get('document')], { documentType: formData.get('documentType') });
  }
  return api.upload(basePath, formData);
}
