// src/services/storage/r2Driver.js
//
// Cloudflare R2 (S3-compatible) storage driver.
//
// UPLOAD MODEL ("direct upload", chosen because Vercel Functions reject request bodies over 4.5 MB):
//   1. The browser asks the API for an upload target. The API authenticates + authorizes the user,
//      checks the declared type/size against the policy, and returns a short-lived presigned PUT URL
//      for a PENDING key (pending/<final key>) with the Content-Type bound into the signature.
//   2. The browser PUTs the bytes straight to R2.
//   3. The browser tells the API the upload is complete. The API re-authorizes, then finalizeUpload():
//        HEAD the pending object   -> real size must be 1..maxBytes
//        ranged GET of first bytes -> real content (magic bytes) must be an allowed type AND equal the declared type
//        COPY pending -> final key, DELETE pending
//      Anything that fails is deleted and rejected; only validated bytes ever exist at a final key.
//   Orphans (a browser that never calls "complete") are confined to pending/ — add the lifecycle rule
//   from DEPLOYMENT.md to expire that prefix after one day.
//
// The AWS SDK is injected (client + signer) so unit tests can run without credentials or the SDK, and is
// only require()d when a real client is created.

const { detectMimeFromBuffer, uploadError } = require('../../utils/uploadSafety');
const { getPolicy, visibilityForPrefix } = require('./policy');
const { buildFinalKey, toPendingKey, parseFinalKey } = require('./keys');

const PRESIGN_PUT_SECONDS = 300; // time the browser has to start the PUT
const PRESIGN_GET_SECONDS = 120; // private document links are short-lived
const HEAD_BYTES = 16;

function errorStatus(err) {
  return (err && err.$metadata && err.$metadata.httpStatusCode) || null;
}
function isNotFound(err) {
  return err && (err.name === 'NotFound' || err.name === 'NoSuchKey' || errorStatus(err) === 404);
}

/**
 * @param {object} deps
 * @param {{send: Function}} deps.client      S3Client-compatible
 * @param {Function} deps.signUrl             async (command, {expiresIn}) => url   (getSignedUrl)
 * @param {object} deps.commands              { PutObjectCommand, GetObjectCommand, HeadObjectCommand, CopyObjectCommand, DeleteObjectCommand, HeadBucketCommand }
 * @param {{publicBucket: string, privateBucket: string, publicBaseUrl: string}} deps.config
 */
function createR2Driver({ client, signUrl, commands, config }) {
  const { publicBucket, privateBucket } = config;
  const publicBaseUrl = String(config.publicBaseUrl || '').replace(/\/+$/, '');

  function bucketForVisibility(visibility) {
    return visibility === 'private' ? privateBucket : publicBucket;
  }
  function bucketForKey(key) {
    const parsed = parseFinalKey(key);
    if (!parsed) return null;
    return bucketForVisibility(visibilityForPrefix(parsed.prefix));
  }

  /** What gets stored in MySQL for a final key: a public URL for public kinds, the bare key for private kinds. */
  function referenceForKey(key) {
    const parsed = parseFinalKey(key);
    if (!parsed) throw new Error('Invalid storage key');
    return visibilityForPrefix(parsed.prefix) === 'public' ? `${publicBaseUrl}/${key}` : key;
  }

  /**
   * Presigned PUT for a fresh pending key.
   * @returns {{ pendingKey, finalKey, uploadUrl, headers, expiresInSeconds, maxBytes }}
   */
  async function createUploadTarget({ kind, ownerId, contentType }) {
    const policy = getPolicy(kind);
    if (!policy.mimes.includes(contentType)) throw uploadError(415, 'That file type is not allowed.');
    const finalKey = buildFinalKey(kind, ownerId, contentType);
    const pendingKey = toPendingKey(finalKey);
    const command = new commands.PutObjectCommand({
      Bucket: bucketForVisibility(policy.visibility),
      Key: pendingKey,
      ContentType: contentType,
    });
    const uploadUrl = await signUrl(client, command, { expiresIn: PRESIGN_PUT_SECONDS });
    return {
      pendingKey,
      finalKey,
      uploadUrl,
      headers: { 'Content-Type': contentType },
      expiresInSeconds: PRESIGN_PUT_SECONDS,
      maxBytes: policy.maxBytes,
    };
  }

  async function deleteKey(bucket, key) {
    try {
      await client.send(new commands.DeleteObjectCommand({ Bucket: bucket, Key: key }));
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Validates what the browser actually uploaded and promotes it to its final key.
   * Throws an uploadError (400/413/415) — after deleting the pending object — if anything is wrong.
   * @returns {{ key: string, reference: string, contentType: string, size: number }}
   */
  async function finalizeUpload({ kind, pendingKey, declaredContentType }) {
    const policy = getPolicy(kind);
    const bucket = bucketForVisibility(policy.visibility);
    const finalKey = pendingKey.replace(/^pending\//, '');
    if (!parseFinalKey(finalKey)) throw uploadError(400, 'Invalid upload reference.');

    const reject = async (status, message) => {
      await deleteKey(bucket, pendingKey);
      throw uploadError(status, message);
    };

    let head;
    try {
      head = await client.send(new commands.HeadObjectCommand({ Bucket: bucket, Key: pendingKey }));
    } catch (err) {
      if (isNotFound(err)) throw uploadError(400, 'The file was not uploaded (or the upload link expired). Please try again.');
      throw err;
    }

    const size = Number(head.ContentLength || 0);
    if (!size) return reject(400, 'The uploaded file is empty.');
    if (size > policy.maxBytes) return reject(413, `That file is too large (limit ${Math.round(policy.maxBytes / (1024 * 1024))} MB).`);

    let bytes;
    try {
      const got = await client.send(
        new commands.GetObjectCommand({ Bucket: bucket, Key: pendingKey, Range: `bytes=0-${HEAD_BYTES - 1}` })
      );
      bytes = Buffer.from(await got.Body.transformToByteArray());
    } catch (err) {
      if (isNotFound(err)) throw uploadError(400, 'The file was not uploaded. Please try again.');
      throw err;
    }
    const detected = detectMimeFromBuffer(bytes);
    if (!detected || !policy.mimes.includes(detected)) {
      return reject(415, 'That file is not an accepted type. Its contents do not match an allowed format.');
    }
    const declared = declaredContentType || head.ContentType;
    if (detected !== declared || (head.ContentType && head.ContentType !== detected)) {
      return reject(415, 'The file contents do not match its declared type.');
    }
    // The extension in the key was fixed at presign time from the declared type; it must still agree.
    const parsed = parseFinalKey(finalKey);
    const extOk = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf' }[detected] === parsed.ext;
    if (!extOk) return reject(415, 'The file contents do not match its declared type.');

    try {
      await client.send(
        new commands.CopyObjectCommand({ Bucket: bucket, Key: finalKey, CopySource: `${bucket}/${pendingKey}` })
      );
    } catch (err) {
      await deleteKey(bucket, pendingKey);
      throw err;
    }
    await deleteKey(bucket, pendingKey); // best effort; the lifecycle rule covers a failure here
    return { key: finalKey, reference: referenceForKey(finalKey), contentType: detected, size };
  }

  /** Deletes a FINAL object by key. Only ever acts on keys matching the strict pattern. Never throws. */
  async function deleteObject(key) {
    const bucket = bucketForKey(key);
    if (!bucket) return false;
    return deleteKey(bucket, key);
  }

  /** Deletes a pending object (cleanup after a rejected request). Never throws. */
  async function deletePending(pendingKey) {
    const finalKey = String(pendingKey).replace(/^pending\//, '');
    const bucket = bucketForKey(finalKey);
    if (!bucket) return false;
    return deleteKey(bucket, pendingKey);
  }

  /** Short-lived presigned GET for a PRIVATE object. The URL is never persisted. */
  async function createPrivateReadUrl(key, { contentType } = {}) {
    const parsed = parseFinalKey(key);
    if (!parsed || visibilityForPrefix(parsed.prefix) !== 'private') return null;
    const command = new commands.GetObjectCommand({
      Bucket: privateBucket,
      Key: key,
      ResponseContentDisposition: 'inline',
      ...(contentType ? { ResponseContentType: contentType } : {}),
    });
    const url = await signUrl(client, command, { expiresIn: PRESIGN_GET_SECONDS });
    return { url, expiresInSeconds: PRESIGN_GET_SECONDS };
  }

  /** Direct server-side write (used only by the one-time migration script). */
  async function putObject({ key, body, contentType }) {
    const bucket = bucketForKey(key);
    if (!bucket) throw new Error('Invalid storage key');
    await client.send(new commands.PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
  }

  /** Cheap reachability probe for the readiness endpoint. */
  async function checkReachable() {
    const result = { publicBucket: false, privateBucket: false };
    try { await client.send(new commands.HeadBucketCommand({ Bucket: publicBucket })); result.publicBucket = true; } catch (err) { /* reported as false */ }
    try { await client.send(new commands.HeadBucketCommand({ Bucket: privateBucket })); result.privateBucket = true; } catch (err) { /* reported as false */ }
    return result;
  }

  return {
    name: 'r2',
    mode: 'direct',
    createUploadTarget,
    finalizeUpload,
    deleteObject,
    deletePending,
    createPrivateReadUrl,
    putObject,
    checkReachable,
    referenceForKey,
  };
}

/** Builds the real SDK-backed driver from validated config. The SDK is loaded only here. */
function createR2DriverFromConfig(config) {
  // eslint-disable-next-line global-require
  const s3 = require('@aws-sdk/client-s3');
  // eslint-disable-next-line global-require
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  const client = new s3.S3Client({
    region: 'auto', // required by the SDK, ignored by R2
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    // The SDK's newer default adds optional checksum headers that browsers cannot send on a presigned PUT.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  return createR2Driver({
    client,
    signUrl: getSignedUrl,
    commands: {
      PutObjectCommand: s3.PutObjectCommand,
      GetObjectCommand: s3.GetObjectCommand,
      HeadObjectCommand: s3.HeadObjectCommand,
      CopyObjectCommand: s3.CopyObjectCommand,
      DeleteObjectCommand: s3.DeleteObjectCommand,
      HeadBucketCommand: s3.HeadBucketCommand,
    },
    config,
  });
}

module.exports = { createR2Driver, createR2DriverFromConfig, PRESIGN_PUT_SECONDS, PRESIGN_GET_SECONDS };
