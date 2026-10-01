// src/utils/propertyRules.js
// Pure rules for the property lifecycle and moderation. No DB / Express.
//
// Existing moderation model: new listings start as 'pending_review' (or 'draft'); they only become
// public ('active') when an ADMIN approves them. These rules extend that to EDITS, so an approved
// listing can't be changed into something the admin never reviewed.

const MAX_IMAGES_PER_PROPERTY = 30;

// Statuses in which the owner/agent may edit the listing's content.
const EDITABLE_STATUSES = Object.freeze(['draft', 'pending_review', 'rejected', 'active']);

function canEditStatus(role, status) {
  if (role === 'admin') return true;
  return EDITABLE_STATUSES.includes(status);
}

function notEditableMessage(status) {
  switch (status) {
    case 'under_contract':
      return 'This listing is under contract and can no longer be edited.';
    case 'sold':
      return 'This listing has been sold and can no longer be edited.';
    case 'archived':
      return 'This listing is archived and can no longer be edited.';
    default:
      return 'This listing cannot be edited in its current state.';
  }
}

/**
 * Status after the owner edits the CONTENT of a listing.
 *  - admin edits never change the status (admins are the moderators).
 *  - an ACTIVE (live, approved) listing goes back to 'pending_review' — the changes must be re-approved.
 *  - a draft or rejected listing only enters review when the owner explicitly submits it.
 *  - a pending listing stays pending.
 */
function statusAfterEdit({ role, status, submitForReview }) {
  if (role === 'admin') return status;
  if (status === 'active') return 'pending_review';
  if ((status === 'draft' || status === 'rejected') && submitForReview) return 'pending_review';
  return status;
}

/** Adding photos to a live listing is public content too; removing photos or changing amenities is not. */
function statusAfterImageAdd({ role, status }) {
  if (role !== 'admin' && status === 'active') return 'pending_review';
  return status;
}

module.exports = {
  MAX_IMAGES_PER_PROPERTY,
  EDITABLE_STATUSES,
  canEditStatus,
  notEditableMessage,
  statusAfterEdit,
  statusAfterImageAdd,
};
