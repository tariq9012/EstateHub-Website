// src/controllers/licenseRenewal.controller.js

const agentModel = require('../models/agent.model');
const licenseRenewalModel = require('../models/licenseRenewal.model');
const verificationDocumentModel = require('../models/verificationDocument.model');
const adminUserModel = require('../models/adminUser.model');
const adminActionLogModel = require('../models/adminActionLog.model');
const notificationModel = require('../models/notification.model');
const asyncHandler = require('../utils/asyncHandler');
const rules = require('../utils/agentPortalRules');
const storage = require('../services/storage');
const { success, failure } = require('../utils/apiResponse');

const ALLOWED_DOCUMENT_TYPES = rules.DOCUMENT_TYPES;

/** Loads a renewal and confirms it belongs to the JWT-derived agent; otherwise null (=> 404). */
async function loadOwnRenewal(agent, renewalId) {
  if (!Number.isInteger(renewalId) || renewalId < 1) return null;
  const renewal = await licenseRenewalModel.findById(renewalId);
  return renewal && renewal.agent_id === agent.agent_id ? renewal : null;
}

/**
 * POST /api/license-renewals
 * Agent only — starts a new renewal from the agent's current on-file expiry date.
 * Only one renewal may be in progress at a time (409 with the existing renewal's id otherwise).
 */
const createRenewal = asyncHandler(async (req, res) => {
  const agent = await agentModel.findByUserId(req.user.userId);
  if (!agent) return failure(res, 'Agent profile not found for this account', 404);
  if (!agent.license_expiry_date) {
    return failure(res, 'No license expiry date on file for this agent', 400, { code: 'NO_EXPIRY_ON_FILE' });
  }

  const open = await licenseRenewalModel.findOpenByAgent(agent.agent_id);
  if (open) {
    return failure(res, 'You already have a license renewal in progress.', 409, {
      code: 'RENEWAL_ALREADY_OPEN',
      renewalId: open.renewal_id,
    });
  }

  const renewalId = await licenseRenewalModel.create(agent.agent_id, agent.license_expiry_date);
  const renewal = await licenseRenewalModel.findById(renewalId);
  return success(res, { renewal }, 201);
});

/**
 * POST /api/license-renewals/:id/documents
 * Agent only — multipart, field name "document". Body: { documentType }
 * Only while the renewal is editable by the agent (draft / documents_pending / missing_documents).
 */
const uploadRenewalDocument = asyncHandler(async (req, res) => {
  const agent = await agentModel.findByUserId(req.user.userId);
  if (!agent) return failure(res, 'Agent profile not found for this account', 404);

  const renewalId = Number(req.params.id);
  const renewal = await loadOwnRenewal(agent, renewalId);
  if (!renewal) return failure(res, 'Renewal not found', 404);

  if (!req.file) return failure(res, 'No document file was uploaded', 400);

  const { documentType } = req.body;
  if (!ALLOWED_DOCUMENT_TYPES.includes(documentType)) {
    return failure(res, `documentType must be one of: ${ALLOWED_DOCUMENT_TYPES.join(', ')}`, 400);
  }
  if (!rules.canEditRenewalDocuments(renewal.status)) {
    return failure(res, 'Documents can no longer be added to this renewal.', 409, { code: 'RENEWAL_LOCKED' });
  }
  const count = await verificationDocumentModel.countForRenewal(renewalId);
  if (count >= rules.MAX_RENEWAL_DOCUMENTS) {
    return failure(res, `A renewal can have at most ${rules.MAX_RENEWAL_DOCUMENTS} documents.`, 409, { code: 'TOO_MANY_DOCUMENTS' });
  }

  const documentId = await verificationDocumentModel.createDocument({
    agentId: agent.agent_id,
    renewalId,
    documentType,
    fileUrl: req.file.storedRef || `/uploads/documents/${req.file.filename}`,
  });

  await licenseRenewalModel.markDocumentsPending(renewalId);

  return success(res, { documentId }, 201);
});

/**
 * DELETE /api/license-renewals/:id/documents/:documentId
 * Agent only — removes one of the agent's OWN documents on their OWN renewal, while it is editable.
 */
const deleteRenewalDocument = asyncHandler(async (req, res) => {
  const agent = await agentModel.findByUserId(req.user.userId);
  if (!agent) return failure(res, 'Agent profile not found for this account', 404);

  const renewal = await loadOwnRenewal(agent, Number(req.params.id));
  if (!renewal) return failure(res, 'Renewal not found', 404);

  const documentId = Number(req.params.documentId);
  if (!Number.isInteger(documentId) || documentId < 1) return failure(res, 'Invalid document id', 400);
  const document = await verificationDocumentModel.findById(documentId);
  if (!document || document.renewal_id !== renewal.renewal_id || document.agent_id !== agent.agent_id) {
    return failure(res, 'Document not found', 404);
  }
  if (!rules.canDeleteRenewalDocument({ document, renewalStatus: renewal.status })) {
    return failure(res, 'This document can no longer be removed.', 409, { code: 'DOCUMENT_LOCKED' });
  }

  await verificationDocumentModel.deleteDocument(documentId);
  await storage.deleteByReference(document.file_url);
  return success(res, { message: 'Document removed' }, 200);
});

/**
 * PUT /api/license-renewals/:id/submit
 * Agent only — moves the renewal to 'submitted'. Only from draft / documents_pending /
 * missing_documents (never from submitted, under_review, approved or rejected), and only with
 * at least one document and no unresolved rejected documents.
 */
const submitRenewal = asyncHandler(async (req, res) => {
  const agent = await agentModel.findByUserId(req.user.userId);
  if (!agent) return failure(res, 'Agent profile not found for this account', 404);

  const renewal = await loadOwnRenewal(agent, Number(req.params.id));
  if (!renewal) return failure(res, 'Renewal not found', 404);

  const documents = await verificationDocumentModel.listForRenewal(renewal.renewal_id);
  const check = rules.checkRenewalSubmission({ renewal, documents });
  if (!check.ok) return failure(res, check.message, check.httpStatus, { code: check.code });

  const moved = await licenseRenewalModel.submitIfStatus(renewal.renewal_id, rules.AGENT_EDITABLE_RENEWAL_STATUSES);
  if (!moved) {
    return failure(res, 'This renewal was just updated. Please refresh and try again.', 409, { code: 'RENEWAL_CHANGED' });
  }
  const updated = await licenseRenewalModel.findById(renewal.renewal_id);
  return success(res, { renewal: updated }, 200);
});

/**
 * GET /api/license-renewals/me
 * Agent only. Each renewal now also carries its own `documents` (additive).
 */
const getMyRenewals = asyncHandler(async (req, res) => {
  const agent = await agentModel.findByUserId(req.user.userId);
  if (!agent) return failure(res, 'Agent profile not found for this account', 404);

  const renewals = await licenseRenewalModel.listForAgent(agent.agent_id);
  const withDocuments = await Promise.all(
    renewals.map(async (renewal) => {
      const documents = await verificationDocumentModel.listForRenewal(renewal.renewal_id);
      return { ...renewal, documents: documents.map(rules.toAgentDocument) };
    })
  );
  return success(res, { renewals: withDocuments }, 200);
});

/**
 * GET /api/license-renewals
 * Admin only. Query: ?status=submitted|under_review|...
 */
const listAllRenewals = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const renewals = await licenseRenewalModel.listAll({ status });
  // Admin needs to see each renewal's submitted documents and their statuses (section 6 of the
  // Admin Portal spec) — attach them the same way getMyRenewals does for the agent-facing list.
  const withDocuments = await Promise.all(
    renewals.map(async (renewal) => {
      const documents = await verificationDocumentModel.listForRenewal(renewal.renewal_id);
      return { ...renewal, documents };
    })
  );
  return success(res, { renewals: withDocuments }, 200);
});

/**
 * PUT /api/license-renewals/:id/under-review
 * Admin only. Moves a 'submitted' renewal into 'under_review' so it shows as being actively
 * worked. Only from 'submitted' (compare-and-set) — returns 409 otherwise.
 */
const moveToUnderReview = asyncHandler(async (req, res) => {
  const renewalId = Number(req.params.id);
  const renewal = await licenseRenewalModel.findById(renewalId);
  if (!renewal) return failure(res, 'Renewal not found', 404);

  const admin = await adminUserModel.findByUserId(req.user.userId);
  if (!admin) return failure(res, 'Admin profile not found for this account', 403);

  const applied = await licenseRenewalModel.moveToUnderReview(renewalId, admin.admin_id);
  if (!applied) {
    return failure(res, 'This renewal is not awaiting review (it may already be under review or decided).', 409, {
      code: 'INVALID_TRANSITION',
    });
  }
  await adminActionLogModel.logAction({
    adminId: admin.admin_id,
    actionType: 'renewal_under_review',
    targetType: 'license_renewal',
    targetId: renewalId,
  });

  const updated = await licenseRenewalModel.findById(renewalId);
  return success(res, { renewal: updated }, 200);
});

/**
 * PUT /api/license-renewals/:id/approve
 * Admin only. Body: { newExpiryDate }. Only from 'under_review' (compare-and-set) — the admin
 * must move a renewal into review before deciding it. Also updates the agent's actual
 * license_expiry_date on the agents table — that column is the source of
 * truth used everywhere else (e.g. certification tracking).
 */
const approveRenewal = asyncHandler(async (req, res) => {
  const renewalId = Number(req.params.id);
  const { newExpiryDate } = req.body;

  const renewal = await licenseRenewalModel.findById(renewalId);
  if (!renewal) return failure(res, 'Renewal not found', 404);

  const admin = await adminUserModel.findByUserId(req.user.userId);
  if (!admin) return failure(res, 'Admin profile not found for this account', 403);

  const applied = await licenseRenewalModel.approve(renewalId, admin.admin_id, newExpiryDate);
  if (!applied) {
    return failure(res, 'This renewal must be under review before it can be approved.', 409, {
      code: 'INVALID_TRANSITION',
    });
  }
  await agentModel.updateLicenseExpiry(renewal.agent_id, newExpiryDate);
  await adminActionLogModel.logAction({
    adminId: admin.admin_id,
    actionType: 'renewal_approved',
    targetType: 'license_renewal',
    targetId: renewalId,
  });

  const agent = await agentModel.findFullById(renewal.agent_id);
  if (agent) {
    await notificationModel.create({
      userId: agent.user_id,
      type: 'renewal_approved',
      title: 'Your license renewal was approved',
      body: `Your license is now valid until ${newExpiryDate}.`,
    });
  }

  const updated = await licenseRenewalModel.findById(renewalId);
  return success(res, { renewal: updated }, 200);
});

/**
 * PUT /api/license-renewals/:id/reject
 * Admin only. Only from 'under_review' (compare-and-set).
 */
const rejectRenewal = asyncHandler(async (req, res) => {
  const renewalId = Number(req.params.id);
  const renewal = await licenseRenewalModel.findById(renewalId);
  if (!renewal) return failure(res, 'Renewal not found', 404);

  const admin = await adminUserModel.findByUserId(req.user.userId);
  if (!admin) return failure(res, 'Admin profile not found for this account', 403);

  const applied = await licenseRenewalModel.reject(renewalId, admin.admin_id);
  if (!applied) {
    return failure(res, 'This renewal must be under review before it can be rejected.', 409, {
      code: 'INVALID_TRANSITION',
    });
  }
  await adminActionLogModel.logAction({
    adminId: admin.admin_id,
    actionType: 'renewal_rejected',
    targetType: 'license_renewal',
    targetId: renewalId,
  });

  const agent = await agentModel.findFullById(renewal.agent_id);
  if (agent) {
    await notificationModel.create({
      userId: agent.user_id,
      type: 'renewal_rejected',
      title: 'Your license renewal was rejected',
    });
  }

  const updated = await licenseRenewalModel.findById(renewalId);
  return success(res, { renewal: updated }, 200);
});

/**
 * PUT /api/license-renewals/:id/request-documents
 * Admin only. Only from 'under_review' (compare-and-set).
 */
const requestMoreDocuments = asyncHandler(async (req, res) => {
  const renewalId = Number(req.params.id);
  const renewal = await licenseRenewalModel.findById(renewalId);
  if (!renewal) return failure(res, 'Renewal not found', 404);

  const admin = await adminUserModel.findByUserId(req.user.userId);
  if (!admin) return failure(res, 'Admin profile not found for this account', 403);

  const applied = await licenseRenewalModel.requestMoreDocuments(renewalId, admin.admin_id);
  if (!applied) {
    return failure(res, 'This renewal must be under review before requesting more documents.', 409, {
      code: 'INVALID_TRANSITION',
    });
  }
  await adminActionLogModel.logAction({
    adminId: admin.admin_id,
    actionType: 'renewal_documents_requested',
    targetType: 'license_renewal',
    targetId: renewalId,
  });

  const agent = await agentModel.findFullById(renewal.agent_id);
  if (agent) {
    await notificationModel.create({
      userId: agent.user_id,
      type: 'renewal_missing_documents',
      title: 'Additional documents needed for your license renewal',
    });
  }

  const updated = await licenseRenewalModel.findById(renewalId);
  return success(res, { renewal: updated }, 200);
});

module.exports = {
  createRenewal,
  uploadRenewalDocument,
  deleteRenewalDocument,
  submitRenewal,
  getMyRenewals,
  listAllRenewals,
  moveToUnderReview,
  approveRenewal,
  rejectRenewal,
  requestMoreDocuments,
};
