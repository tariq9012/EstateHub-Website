// src/controllers/directUpload.controller.js
//
// "Presign" half of browser-direct uploads (STORAGE_DRIVER=r2). Every handler runs only after authenticate
// (+ the same role/ownership middleware as the legacy multipart route it mirrors) and applies the same
// business pre-checks the real controller applies, so a URL is never issued for an upload that would be refused.
// The authoritative checks still run again on "complete" (middleware/directUpload.js + the existing controllers).

const asyncHandler = require('../utils/asyncHandler');
const { success, failure } = require('../utils/apiResponse');
const storage = require('../services/storage');
const { getPolicy } = require('../services/storage/policy');
const propertyRules = require('../utils/propertyRules');
const rules = require('../utils/agentPortalRules');
const propertyImageModel = require('../models/propertyImage.model');
const agentModel = require('../models/agent.model');
const verificationDocumentModel = require('../models/verificationDocument.model');
const licenseRenewalModel = require('../models/licenseRenewal.model');

/** GET /api/uploads/mode — tells the frontend which upload flow to use. Public; reveals nothing sensitive. */
const getUploadMode = (req, res) => success(res, { mode: storage.getUploadMode() }, 200);

/** Rejects (with a response) when this process is not in direct-upload mode. */
function requireDirectMode(req, res, next) {
  if (storage.getUploadMode() !== 'direct') {
    return failure(res, 'Direct uploads are not enabled on this server. Use the standard multipart upload.', 409, {
      code: 'DIRECT_UPLOAD_DISABLED',
    });
  }
  return next();
}

/** Validates the declared { contentType, size } list. Returns an error string or null. */
function checkDeclared(kind, files) {
  const policy = getPolicy(kind);
  if (!Array.isArray(files) || files.length === 0) return 'Describe the file(s) to upload.';
  if (files.length > policy.maxPerRequest) return `At most ${policy.maxPerRequest} file(s) per request.`;
  for (const f of files) {
    if (!f || typeof f.contentType !== 'string' || !policy.mimes.includes(f.contentType)) {
      return 'That file type is not allowed.';
    }
    if (!Number.isInteger(f.size) || f.size < 1) return 'Invalid file size.';
    if (f.size > policy.maxBytes) return `That file is too large (limit ${Math.round(policy.maxBytes / (1024 * 1024))} MB).`;
  }
  return null;
}

async function targetsFor(kind, ownerId, files) {
  const uploads = [];
  for (const f of files) {
    // eslint-disable-next-line no-await-in-loop
    const t = await storage.createUploadTarget({ kind, ownerId, contentType: f.contentType });
    uploads.push({ key: t.pendingKey, uploadUrl: t.uploadUrl, headers: t.headers, expiresInSeconds: t.expiresInSeconds, maxBytes: t.maxBytes });
  }
  return uploads;
}

/** POST /api/properties/:id/images/direct/presign   (after authenticate + requirePropertyModifier) */
const presignPropertyImages = asyncHandler(async (req, res) => {
  const existing = req.property;
  const files = req.body && req.body.files;
  const bad = checkDeclared('property-image', files);
  if (bad) return failure(res, bad, 400);
  if (!propertyRules.canEditStatus(req.user.role, existing.status)) {
    return failure(res, propertyRules.notEditableMessage(existing.status), 409, { code: 'PROPERTY_NOT_EDITABLE' });
  }
  const currentCount = await propertyImageModel.countByProperty(existing.property_id);
  if (currentCount + files.length > propertyRules.MAX_IMAGES_PER_PROPERTY) {
    return failure(res, `A listing can have at most ${propertyRules.MAX_IMAGES_PER_PROPERTY} photos.`, 400, { code: 'TOO_MANY_IMAGES' });
  }
  const uploads = await targetsFor('property-image', existing.property_id, files);
  return success(res, { uploads }, 200);
});

/** POST /api/verification/documents/direct/presign   (after authenticate + authorize('agent')) */
const presignVerificationDocument = asyncHandler(async (req, res) => {
  const agent = await agentModel.findByUserId(req.user.userId);
  if (!agent) return failure(res, 'Agent profile not found for this account', 404);
  const bad = checkDeclared('verification-document', req.body && req.body.files);
  if (bad) return failure(res, bad, 400);
  if (!rules.DOCUMENT_TYPES.includes(req.body.documentType)) {
    return failure(res, `documentType must be one of: ${rules.DOCUMENT_TYPES.join(', ')}`, 400);
  }
  if (!rules.canModifyVerificationDocuments(agent.verification_status)) {
    return failure(res, 'Your account is already verified. Use a license renewal to update your credentials.', 409, { code: 'ALREADY_VERIFIED' });
  }
  const existingCount = await verificationDocumentModel.countForAgentInitial(agent.agent_id);
  if (existingCount >= rules.MAX_VERIFICATION_DOCUMENTS) {
    return failure(res, `You can keep at most ${rules.MAX_VERIFICATION_DOCUMENTS} verification documents. Remove one first.`, 409, { code: 'TOO_MANY_DOCUMENTS' });
  }
  const uploads = await targetsFor('verification-document', agent.agent_id, req.body.files);
  return success(res, { uploads }, 200);
});

/** POST /api/license-renewals/:id/documents/direct/presign   (after authenticate + authorize('agent')) */
const presignRenewalDocument = asyncHandler(async (req, res) => {
  const agent = await agentModel.findByUserId(req.user.userId);
  if (!agent) return failure(res, 'Agent profile not found for this account', 404);
  const renewalId = Number(req.params.id);
  const renewal = Number.isInteger(renewalId) && renewalId > 0 ? await licenseRenewalModel.findById(renewalId) : null;
  if (!renewal || renewal.agent_id !== agent.agent_id) return failure(res, 'Renewal not found', 404);
  const bad = checkDeclared('renewal-document', req.body && req.body.files);
  if (bad) return failure(res, bad, 400);
  if (!rules.DOCUMENT_TYPES.includes(req.body.documentType)) {
    return failure(res, `documentType must be one of: ${rules.DOCUMENT_TYPES.join(', ')}`, 400);
  }
  if (!rules.canEditRenewalDocuments(renewal.status)) {
    return failure(res, 'Documents can no longer be added to this renewal.', 409, { code: 'RENEWAL_LOCKED' });
  }
  const count = await verificationDocumentModel.countForRenewal(renewalId);
  if (count >= rules.MAX_RENEWAL_DOCUMENTS) {
    return failure(res, `A renewal can have at most ${rules.MAX_RENEWAL_DOCUMENTS} documents.`, 409, { code: 'TOO_MANY_DOCUMENTS' });
  }
  const uploads = await targetsFor('renewal-document', agent.agent_id, req.body.files);
  return success(res, { uploads }, 200);
});

// --- owner resolvers for the "complete" middleware (finalizeDirectUploads) ---

/** property images: the (already-authorized) property from requirePropertyModifier. */
async function resolvePropertyOwner(req) {
  return req.property ? req.property.property_id : null;
}

/** documents: the caller's OWN agent id from the JWT — never an id from the request. */
async function resolveAgentOwner(req, res) {
  const agent = await agentModel.findByUserId(req.user.userId);
  if (!agent) {
    failure(res, 'Agent profile not found for this account', 404);
    return null;
  }
  return agent.agent_id;
}

module.exports = {
  getUploadMode,
  requireDirectMode,
  checkDeclared,
  presignPropertyImages,
  presignVerificationDocument,
  presignRenewalDocument,
  resolvePropertyOwner,
  resolveAgentOwner,
};
