// src/utils/agentPortalRules.js
// Pure rules for agent verification and license renewals. No DB / Express.

const DOCUMENT_TYPES = Object.freeze(['license', 'insurance', 'certification', 'id_proof', 'other']);

const MAX_VERIFICATION_DOCUMENTS = 20;
const MAX_RENEWAL_DOCUMENTS = 10;

// ---------------------------------------------------------------- verification

/** An agent may add/remove verification documents unless already verified. */
function canModifyVerificationDocuments(agentVerificationStatus) {
  return agentVerificationStatus !== 'verified';
}

/**
 * Whether the agent may delete an initial-verification document.
 *  - verified documents: never (an admin accepted them)
 *  - rejected documents: always (they exist to be replaced)
 *  - pending documents: only while the agent has NOT submitted for review (an admin may be looking at them)
 */
function canDeleteVerificationDocument({ document, agentVerificationStatus }) {
  if (agentVerificationStatus === 'verified') return false;
  if (document.status === 'verified') return false;
  if (document.status === 'rejected') return true;
  return agentVerificationStatus !== 'pending';
}

/** Can the agent submit for review? Returns { ok, missing[] } (missing = human-readable list). */
function checkVerificationSubmission({ agent, documents }) {
  const missing = [];
  if (!['unverified', 'rejected'].includes(agent.verification_status)) {
    return { ok: false, missing, reason: agent.verification_status === 'pending' ? 'ALREADY_PENDING' : 'ALREADY_VERIFIED' };
  }
  const hasLicenseDoc = documents.some((d) => d.document_type === 'license' && d.status !== 'rejected');
  if (!hasLicenseDoc) missing.push('a license document');
  if (!agent.license_expiry_date) missing.push('your license expiry date');
  return { ok: missing.length === 0, missing, reason: missing.length ? 'INCOMPLETE' : null };
}

/**
 * The license expiry is self-declared only until an admin verifies the agent. Afterwards it can
 * only change through an approved renewal — otherwise a verified agent could simply type a new date.
 */
function canEditLicenseExpiry(agentVerificationStatus) {
  return agentVerificationStatus !== 'verified';
}

// -------------------------------------------------------------------- renewals

const OPEN_RENEWAL_STATUSES = Object.freeze(['draft', 'documents_pending', 'submitted', 'under_review', 'missing_documents']);
// statuses in which the AGENT may add/remove documents and (re)submit
const AGENT_EDITABLE_RENEWAL_STATUSES = Object.freeze(['draft', 'documents_pending', 'missing_documents']);

function isOpenRenewal(status) {
  return OPEN_RENEWAL_STATUSES.includes(status);
}

function canEditRenewalDocuments(status) {
  return AGENT_EDITABLE_RENEWAL_STATUSES.includes(status);
}

function canDeleteRenewalDocument({ document, renewalStatus }) {
  if (!canEditRenewalDocuments(renewalStatus)) return false;
  return document.status !== 'verified';
}

/**
 * Can the agent (re)submit this renewal? Returns { ok, httpStatus, code, message }.
 *  - only from draft / documents_pending / missing_documents (an approved, rejected, submitted or
 *    under-review renewal can never be moved back to 'submitted' by the agent)
 *  - at least one document, and no unresolved rejected documents (replace or remove them first)
 */
function checkRenewalSubmission({ renewal, documents }) {
  if (!canEditRenewalDocuments(renewal.status)) {
    return {
      ok: false,
      httpStatus: 409,
      code: 'RENEWAL_NOT_SUBMITTABLE',
      message:
        renewal.status === 'approved' || renewal.status === 'rejected'
          ? `This renewal has already been ${renewal.status}. Start a new renewal if you need one.`
          : 'This renewal has already been submitted and is being reviewed.',
    };
  }
  if (documents.length === 0) {
    return { ok: false, httpStatus: 400, code: 'NO_DOCUMENTS', message: 'Upload at least one document before submitting.' };
  }
  if (documents.some((d) => d.status === 'rejected')) {
    return {
      ok: false,
      httpStatus: 409,
      code: 'REJECTED_DOCUMENTS_REMAIN',
      message: 'Replace or remove the rejected documents before resubmitting.',
    };
  }
  return { ok: true };
}

/** Strips fields an agent has no business seeing (e.g. which admin reviewed a document). */
function toAgentDocument(doc) {
  return {
    document_id: doc.document_id,
    renewal_id: doc.renewal_id,
    document_type: doc.document_type,
    file_url: doc.file_url,
    status: doc.status,
    rejection_reason: doc.rejection_reason,
    reviewed_at: doc.reviewed_at,
    uploaded_at: doc.uploaded_at,
  };
}

module.exports = {
  DOCUMENT_TYPES,
  MAX_VERIFICATION_DOCUMENTS,
  MAX_RENEWAL_DOCUMENTS,
  OPEN_RENEWAL_STATUSES,
  AGENT_EDITABLE_RENEWAL_STATUSES,
  canModifyVerificationDocuments,
  canDeleteVerificationDocument,
  checkVerificationSubmission,
  canEditLicenseExpiry,
  isOpenRenewal,
  canEditRenewalDocuments,
  canDeleteRenewalDocument,
  checkRenewalSubmission,
  toAgentDocument,
};
