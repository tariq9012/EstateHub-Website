// src/controllers/verification.controller.js

const agentModel = require('../models/agent.model');
const verificationDocumentModel = require('../models/verificationDocument.model');
const adminUserModel = require('../models/adminUser.model');
const adminActionLogModel = require('../models/adminActionLog.model');
const notificationModel = require('../models/notification.model');
const asyncHandler = require('../utils/asyncHandler');
const rules = require('../utils/agentPortalRules');
const storage = require('../services/storage');
const { success, failure } = require('../utils/apiResponse');

const ALLOWED_DOCUMENT_TYPES = rules.DOCUMENT_TYPES;

/**
 * POST /api/verification/documents
 * Agent only — multipart, field name "document". Body: { documentType }
 * The agent is resolved from the JWT; no agent id is ever read from the request. Route order is
 * authenticate -> authorize('agent') -> upload guards, and files of any rejected request are deleted.
 */
const uploadMyDocument = asyncHandler(async (req, res) => {
  const agent = await agentModel.findByUserId(req.user.userId);
  if (!agent) return failure(res, 'Agent profile not found for this account', 404);

  if (!req.file) return failure(res, 'No document file was uploaded', 400);

  const { documentType } = req.body;
  if (!ALLOWED_DOCUMENT_TYPES.includes(documentType)) {
    return failure(res, `documentType must be one of: ${ALLOWED_DOCUMENT_TYPES.join(', ')}`, 400);
  }
  if (!rules.canModifyVerificationDocuments(agent.verification_status)) {
    return failure(res, 'Your account is already verified. Use a license renewal to update your credentials.', 409, {
      code: 'ALREADY_VERIFIED',
    });
  }
  const existingCount = await verificationDocumentModel.countForAgentInitial(agent.agent_id);
  if (existingCount >= rules.MAX_VERIFICATION_DOCUMENTS) {
    return failure(res, `You can keep at most ${rules.MAX_VERIFICATION_DOCUMENTS} verification documents. Remove one first.`, 409, {
      code: 'TOO_MANY_DOCUMENTS',
    });
  }

  const documentId = await verificationDocumentModel.createDocument({
    agentId: agent.agent_id,
    renewalId: null,
    documentType,
    fileUrl: req.file.storedRef || `/uploads/documents/${req.file.filename}`,
  });

  return success(res, { documentId }, 201);
});

/**
 * GET /api/verification/me
 * Agent only — own verification status + uploaded (initial) documents.
 * Additive over the original response ({ verificationStatus, licenseExpiryDate, documents }).
 */
const getMyVerificationStatus = asyncHandler(async (req, res) => {
  const agent = await agentModel.findByUserId(req.user.userId);
  if (!agent) return failure(res, 'Agent profile not found for this account', 404);

  const rawDocuments = await verificationDocumentModel.listInitialVerificationDocs(agent.agent_id);
  const documents = rawDocuments.map(rules.toAgentDocument); // no reviewer ids
  const submission = rules.checkVerificationSubmission({ agent, documents: rawDocuments });

  return success(
    res,
    {
      verificationStatus: agent.verification_status,
      licenseExpiryDate: agent.license_expiry_date,
      licenseNumber: agent.license_number,
      agencyName: agent.agency_name,
      verifiedAt: agent.verification_status === 'verified' ? agent.verified_at : null,
      documents,
      canSubmit: submission.ok,
      missingForSubmission: submission.missing,
      canEditLicenseExpiry: rules.canEditLicenseExpiry(agent.verification_status),
      canModifyDocuments: rules.canModifyVerificationDocuments(agent.verification_status),
    },
    200
  );
});

/**
 * POST /api/verification/submit
 * Agent only — submits THEIR OWN verification for admin review (unverified/rejected -> pending).
 * Requires a non-rejected license document and a license expiry date. Status is never faked: it
 * only becomes 'verified' when an admin verifies the agent.
 */
const submitMyVerification = asyncHandler(async (req, res) => {
  const agent = await agentModel.findByUserId(req.user.userId);
  if (!agent) return failure(res, 'Agent profile not found for this account', 404);

  const documents = await verificationDocumentModel.listInitialVerificationDocs(agent.agent_id);
  const check = rules.checkVerificationSubmission({ agent, documents });
  if (!check.ok) {
    if (check.reason === 'ALREADY_PENDING') {
      return failure(res, 'Your verification is already with the review team.', 409, { code: 'ALREADY_PENDING' });
    }
    if (check.reason === 'ALREADY_VERIFIED') {
      return failure(res, 'Your account is already verified.', 409, { code: 'ALREADY_VERIFIED' });
    }
    return failure(res, `Before submitting, please add ${check.missing.join(' and ')}.`, 400, {
      code: 'INCOMPLETE',
      missing: check.missing,
    });
  }

  const moved = await agentModel.submitForVerification(agent.agent_id);
  if (!moved) {
    return failure(res, 'Your verification status just changed. Please refresh and try again.', 409, { code: 'STATUS_CHANGED' });
  }

  const updated = await agentModel.findByUserId(req.user.userId);
  return success(res, { verificationStatus: updated.verification_status }, 200);
});

/**
 * DELETE /api/verification/documents/:documentId
 * Agent only. Removes one of THEIR OWN initial-verification documents (row + file on disk).
 * Ownership is decided by the stored agent_id vs the JWT-derived agent; others get 404.
 */
const deleteMyDocument = asyncHandler(async (req, res) => {
  const agent = await agentModel.findByUserId(req.user.userId);
  if (!agent) return failure(res, 'Agent profile not found for this account', 404);

  const documentId = Number(req.params.documentId);
  if (!Number.isInteger(documentId) || documentId < 1) return failure(res, 'Invalid document id', 400);

  const document = await verificationDocumentModel.findById(documentId);
  if (!document || document.agent_id !== agent.agent_id || document.renewal_id !== null) {
    return failure(res, 'Document not found', 404);
  }
  if (!rules.canDeleteVerificationDocument({ document, agentVerificationStatus: agent.verification_status })) {
    return failure(
      res,
      document.status === 'verified'
        ? 'A verified document cannot be removed.'
        : 'Documents under review cannot be removed. Wait for the review, or ask support.',
      409,
      { code: 'DOCUMENT_LOCKED' }
    );
  }

  await verificationDocumentModel.deleteDocument(documentId);
  await storage.deleteByReference(document.file_url);
  return success(res, { message: 'Document removed' }, 200);
});

/**
 * GET /api/verification/queue
 * Admin only. Query: ?status=pending|verified|rejected|unverified (default 'pending')
 */
const listVerificationQueue = asyncHandler(async (req, res) => {
  const status = req.query.status || 'pending';
  const agents = await agentModel.listByVerificationStatus(status);
  return success(res, { agents }, 200);
});

/**
 * GET /api/verification/:agentId
 * Admin only.
 */
const getAgentVerificationDetail = asyncHandler(async (req, res) => {
  const agentId = Number(req.params.agentId);
  if (!Number.isInteger(agentId)) return failure(res, 'Invalid agent id', 400);

  const agent = await agentModel.findFullById(agentId);
  if (!agent) return failure(res, 'Agent not found', 404);

  const documents = await verificationDocumentModel.listInitialVerificationDocs(agentId);
  return success(res, { agent, documents }, 200);
});

/**
 * GET /api/verification/documents/:documentId/file
 * Admin (any permission level — viewing is a read operation) or the agent who owns the document.
 * Verification/renewal documents are never served from the public /uploads static mount (see
 * app.js); this is the only authorized way to fetch their bytes.
 */
const getDocumentFile = asyncHandler(async (req, res) => {
  const documentId = Number(req.params.documentId);
  if (!Number.isInteger(documentId) || documentId < 1) return failure(res, 'Invalid document id', 400);

  const document = await verificationDocumentModel.findById(documentId);
  if (!document) return failure(res, 'Document not found', 404);

  if (req.user.role !== 'admin') {
    const agent = await agentModel.findByUserId(req.user.userId);
    if (!agent || agent.agent_id !== document.agent_id) {
      return failure(res, 'Document not found', 404); // never reveal existence to a non-owner
    }
  }

  // Authorization is done above. Legacy local files are sent directly; R2 documents are never public, so
  // the caller gets a short-lived presigned URL (JSON) that the frontend then fetches. It is never stored.
  const access = await storage.getPrivateFileAccess(document.file_url);
  if (!access) return failure(res, 'Document file is unavailable', 404);
  if (access.type === 'signed-url') {
    res.set('Cache-Control', 'no-store');
    return success(res, { url: access.url, expiresInSeconds: access.expiresInSeconds }, 200);
  }
  return res.sendFile(access.path, (err) => {
    if (err && !res.headersSent) failure(res, 'Document file is unavailable', 404);
  });
});

/**
 * PUT /api/verification/documents/:documentId/verify
 * Admin only. Only a 'pending' document can be verified (compare-and-set).
 */
const verifyDocument = asyncHandler(async (req, res) => {
  const documentId = Number(req.params.documentId);
  const document = await verificationDocumentModel.findById(documentId);
  if (!document) return failure(res, 'Document not found', 404);

  const admin = await adminUserModel.findByUserId(req.user.userId);
  if (!admin) return failure(res, 'Admin profile not found for this account', 403);

  const applied = await verificationDocumentModel.verifyDocument(documentId, admin.admin_id);
  if (!applied) {
    return failure(res, 'This document has already been reviewed.', 409, { code: 'INVALID_TRANSITION' });
  }
  await adminActionLogModel.logAction({
    adminId: admin.admin_id,
    actionType: 'document_verified',
    targetType: 'document',
    targetId: documentId,
  });

  return success(res, { message: 'Document verified' }, 200);
});

/**
 * PUT /api/verification/documents/:documentId/reject
 * Admin only. Body: { reason }. Only a 'pending' document can be rejected (compare-and-set).
 */
const rejectDocument = asyncHandler(async (req, res) => {
  const documentId = Number(req.params.documentId);
  const { reason } = req.body;

  const document = await verificationDocumentModel.findById(documentId);
  if (!document) return failure(res, 'Document not found', 404);

  const admin = await adminUserModel.findByUserId(req.user.userId);
  if (!admin) return failure(res, 'Admin profile not found for this account', 403);

  const applied = await verificationDocumentModel.rejectDocument(documentId, admin.admin_id, reason);
  if (!applied) {
    return failure(res, 'This document has already been reviewed.', 409, { code: 'INVALID_TRANSITION' });
  }
  await adminActionLogModel.logAction({
    adminId: admin.admin_id,
    actionType: 'document_rejected',
    targetType: 'document',
    targetId: documentId,
    notes: reason,
  });

  const agent = await agentModel.findFullById(document.agent_id);
  if (agent) {
    await notificationModel.create({
      userId: agent.user_id,
      type: 'document_rejected',
      title: 'A verification document was rejected',
      body: reason,
      relatedEntityType: 'document',
      relatedEntityId: documentId,
    });
  }

  return success(res, { message: 'Document rejected' }, 200);
});

/**
 * PUT /api/verification/:agentId/verify
 * Admin only. Only an agent whose verification is 'pending' can be verified (compare-and-set).
 */
const verifyAgent = asyncHandler(async (req, res) => {
  const agentId = Number(req.params.agentId);
  const agent = await agentModel.findFullById(agentId);
  if (!agent) return failure(res, 'Agent not found', 404);

  const admin = await adminUserModel.findByUserId(req.user.userId);
  if (!admin) return failure(res, 'Admin profile not found for this account', 403);

  const applied = await agentModel.verifyAgent(agentId, admin.admin_id);
  if (!applied) {
    return failure(res, 'This agent is not awaiting verification (it may already have been decided).', 409, {
      code: 'INVALID_TRANSITION',
    });
  }
  await adminActionLogModel.logAction({
    adminId: admin.admin_id,
    actionType: 'agent_verified',
    targetType: 'agent',
    targetId: agentId,
  });
  await notificationModel.create({
    userId: agent.user_id,
    type: 'agent_verified',
    title: 'Your agent account is verified',
    body: 'You are now a verified agent on EstateHub.',
  });

  const updated = await agentModel.findFullById(agentId);
  return success(res, { agent: updated }, 200);
});

/**
 * PUT /api/verification/:agentId/reject
 * Admin only. Only an agent whose verification is 'pending' can be rejected (compare-and-set).
 */
const rejectAgent = asyncHandler(async (req, res) => {
  const agentId = Number(req.params.agentId);
  const agent = await agentModel.findFullById(agentId);
  if (!agent) return failure(res, 'Agent not found', 404);

  const admin = await adminUserModel.findByUserId(req.user.userId);
  if (!admin) return failure(res, 'Admin profile not found for this account', 403);

  const applied = await agentModel.rejectAgentVerification(agentId, admin.admin_id);
  if (!applied) {
    return failure(res, 'This agent is not awaiting verification (it may already have been decided).', 409, {
      code: 'INVALID_TRANSITION',
    });
  }
  await adminActionLogModel.logAction({
    adminId: admin.admin_id,
    actionType: 'agent_verification_rejected',
    targetType: 'agent',
    targetId: agentId,
  });
  await notificationModel.create({
    userId: agent.user_id,
    type: 'agent_verification_rejected',
    title: 'Your agent verification was not approved',
  });

  const updated = await agentModel.findFullById(agentId);
  return success(res, { agent: updated }, 200);
});

module.exports = {
  uploadMyDocument,
  getMyVerificationStatus,
  submitMyVerification,
  deleteMyDocument,
  getDocumentFile,
  listVerificationQueue,
  getAgentVerificationDetail,
  verifyDocument,
  rejectDocument,
  verifyAgent,
  rejectAgent,
};
