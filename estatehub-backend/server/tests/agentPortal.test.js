// REAL controllers + in-memory models (no MySQL). Focus: ownership, moderation, verification, renewals.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { makeAgentWorld, loadAgentControllers, call, asUser } = require('./helpers/agentWorld');

function setup() {
  const w = makeAgentWorld(); const c = loadAgentControllers(w);
  const as = (uid) => asUser(w, uid);
  return { w, c, as };
}
const A = 3, B = 4, BUYER = 1, ADMIN = 5;   // agent A (agent_id 100), agent B (200), buyer, admin

// ================================================================= property lifecycle / moderation
test('editing a LIVE listing sends it back to review; admin edits do not', async () => {
  const { w, c, as } = setup();
  const r = await call(c.property.updateProperty, { user: as(A), params: { id: '10' }, body: { price: 999, title: 'New title' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.statusChanged, true); assert.equal(r.body.data.previousStatus, 'active');
  assert.equal(w.properties[10].status, 'pending_review'); assert.equal(w.properties[10].price, 999);
  w.properties[10].status = 'active';
  const adminEdit = await call(c.property.updateProperty, { user: as(ADMIN), params: { id: '10' }, body: { price: 5 } });
  assert.equal(adminEdit.status, 200); assert.equal(w.properties[10].status, 'active', 'admins are the moderators');
});

test('draft and rejected listings enter review only when submitted; rejection reason clears on resubmit', async () => {
  const { w, c, as } = setup();
  await call(c.property.updateProperty, { user: as(A), params: { id: '11' }, body: { title: 'Draft edit' } });
  assert.equal(w.properties[11].status, 'draft', 'plain save keeps it a draft');
  await call(c.property.updateProperty, { user: as(A), params: { id: '11' }, body: { title: 'Ready', submitForReview: true } });
  assert.equal(w.properties[11].status, 'pending_review');

  await call(c.property.updateProperty, { user: as(A), params: { id: '12' }, body: { description: 'Better photos' } });
  assert.equal(w.properties[12].status, 'rejected'); assert.equal(w.properties[12].rejection_reason, 'Photos are blurry', 'kept until resubmitted');
  const r = await call(c.property.updateProperty, { user: as(A), params: { id: '12' }, body: { submitForReview: true } });   // resubmit with no content change
  assert.equal(r.status, 200); assert.equal(w.properties[12].status, 'pending_review'); assert.equal(w.properties[12].rejection_reason, null);

  await call(c.property.updateProperty, { user: as(A), params: { id: '13' }, body: { title: 'Still pending' } });
  assert.equal(w.properties[13].status, 'pending_review');
  const nothing = await call(c.property.updateProperty, { user: as(A), params: { id: '13' }, body: {} });
  assert.equal(nothing.status, 400);
});

test('sold / under-contract / archived listings cannot be edited by the owner (admin may)', async () => {
  const { w, c, as } = setup();
  for (const id of ['15', '16', '17']) {
    const r = await call(c.property.updateProperty, { user: as(A), params: { id }, body: { price: 1 } });
    assert.equal(r.status, 409, id); assert.equal(r.body.details.code, 'PROPERTY_NOT_EDITABLE');
    assert.equal(w.properties[Number(id)].price, 100);
  }
  assert.equal((await call(c.property.updateProperty, { user: as(ADMIN), params: { id: '15' }, body: { price: 1 } })).status, 200);
});

test('ownership: Agent B / buyers cannot edit, archive or manage Agent A\'s listing', async () => {
  const { w, c, as } = setup();
  const before = JSON.stringify(w.properties);
  for (const uid of [B, BUYER, 2]) {
    assert.equal((await call(c.property.updateProperty, { user: as(uid), params: { id: '10' }, body: { price: 1 } })).status, 403, `update ${uid}`);
    assert.equal((await call(c.property.archiveProperty, { user: as(uid), params: { id: '10' } })).status, 403, `archive ${uid}`);
    assert.equal((await call(c.property.setPropertyAmenities, { user: as(uid), params: { id: '10' }, body: { amenityIds: [1] } })).status, 403, `amenities ${uid}`);
    assert.equal((await call(c.property.deletePropertyImage, { user: as(uid), params: { id: '10', imageId: '1' } })).status, 403, `image ${uid}`);
  }
  assert.equal((await call(c.property.updateProperty, { user: as(A), params: { id: '999' }, body: { price: 1 } })).status, 404);
  assert.equal(JSON.stringify(w.properties), before, 'nothing changed');
  assert.equal((await call(c.property.updateProperty, { user: as(A), params: { id: '14' }, body: { price: 1 } })).status, 403, 'A cannot edit B\'s property either');
});

test('requirePropertyModifier runs BEFORE multer: non-owners are rejected before any upload', async () => {
  const { c, as } = setup(); const req = (uid, id) => ({ user: as(uid), params: { id } });
  assert.equal((await call(c.property.requirePropertyModifier, req(B, '10'))).status, 403);
  assert.equal((await call(c.property.requirePropertyModifier, req(BUYER, '10'))).status, 403);
  assert.equal((await call(c.property.requirePropertyModifier, req(A, '999'))).status, 404);
  assert.equal((await call(c.property.requirePropertyModifier, req(A, 'abc'))).status, 400);
  const ok = await call(c.property.requirePropertyModifier, req(A, '10')); assert.equal(ok.status, 'next');
});

test('adding photos to a live listing sends it to review; cap and status rules apply', async () => {
  const { w, c, as } = setup(); const files = (n) => Array.from({ length: n }, (_, i) => ({ filename: `f${i}.jpg` }));
  let r = await call(c.property.addPropertyImages, { user: as(A), params: { id: '10' }, files: files(2) });
  assert.equal(r.status, 201); assert.equal(r.body.data.statusChanged, true); assert.equal(w.properties[10].status, 'pending_review');
  assert.equal(r.body.data.images.filter((i) => i.is_primary).length, 1, 'first image becomes primary');
  for (let i = 0; i < 28; i += 1) w.addImage(13);
  r = await call(c.property.addPropertyImages, { user: as(A), params: { id: '13' }, files: files(2) });
  assert.equal(r.status, 201, '28 + 2 = 30 is allowed');
  r = await call(c.property.addPropertyImages, { user: as(A), params: { id: '13' }, files: files(1) });
  assert.equal(r.status, 400); assert.equal(r.body.details.code, 'TOO_MANY_IMAGES');
  assert.equal((await call(c.property.addPropertyImages, { user: as(A), params: { id: '13' }, files: [] })).status, 400, 'no files');
  assert.equal((await call(c.property.addPropertyImages, { user: as(A), params: { id: '15' }, files: files(1) })).status, 409, 'sold listing');
});

test('deleting an image removes the row AND the file, and promotes a new primary', async () => {
  const { w, c, as } = setup();
  const f1 = w.realFile('properties', 'primary-test-a.jpg'); const f2 = w.realFile('properties', 'primary-test-b.jpg');
  const i1 = w.addImage(11, { image_url: f1.url, is_primary: true, display_order: 0 }); const i2 = w.addImage(11, { image_url: f2.url, display_order: 1 });
  try {
    const r = await call(c.property.deletePropertyImage, { user: as(A), params: { id: '11', imageId: String(i1.image_id) } });
    assert.equal(r.status, 200);
    assert.equal(fs.existsSync(f1.abs), false, 'file removed from disk'); assert.equal(fs.existsSync(f2.abs), true, 'other file untouched');
    assert.equal(r.body.data.images.length, 1); assert.equal(r.body.data.images[0].is_primary, true, 'remaining image promoted');
    assert.equal((await call(c.property.deletePropertyImage, { user: as(A), params: { id: '11', imageId: String(i1.image_id) } })).status, 404, 'already gone');
    // an image id that belongs to ANOTHER property can never be deleted through this one
    const other = w.addImage(14, {});
    assert.equal((await call(c.property.deletePropertyImage, { user: as(A), params: { id: '11', imageId: String(other.image_id) } })).status, 404);
    assert.equal(w.images.some((x) => x.image_id === other.image_id), true);
    assert.equal((await call(c.property.setPrimaryImage, { user: as(A), params: { id: '11', imageId: String(other.image_id) } })).status, 404);
    assert.equal((await call(c.property.setPrimaryImage, { user: as(A), params: { id: '11', imageId: String(i2.image_id) } })).status, 200);
  } finally { w.cleanup(); }
});

test('a lost race on the status change is reported (409) and content is left untouched', async () => {
  const { w, c, as } = setup(); w.raceLoss = true;
  const r = await call(c.property.updateProperty, { user: as(A), params: { id: '10' }, body: { price: 1 } });
  assert.equal(r.status, 409); assert.equal(r.body.details.code, 'PROPERTY_CHANGED'); assert.equal(w.properties[10].price, 100);
});

// ================================================================= verification
test('verification upload: JWT agent only, rejects bad types / verified agents / over the cap', async () => {
  const { w, c, as } = setup(); const file = { filename: 'abc.pdf' };
  const ok = await call(c.verification.uploadMyDocument, { user: as(A), body: { documentType: 'license', agentId: 200, agent_id: 200 }, file });
  assert.equal(ok.status, 201); assert.equal(w.docs[0].agent_id, 100, 'agent comes from the JWT, never the body');
  assert.equal((await call(c.verification.uploadMyDocument, { user: as(A), body: { documentType: 'banana' }, file })).status, 400);
  assert.equal((await call(c.verification.uploadMyDocument, { user: as(A), body: { documentType: 'license' } })).status, 400, 'no file');
  assert.equal((await call(c.verification.uploadMyDocument, { user: as(BUYER), body: { documentType: 'license' }, file })).status, 404, 'a buyer has no agent profile');
  w.agents[100].verification_status = 'verified';
  assert.equal((await call(c.verification.uploadMyDocument, { user: as(A), body: { documentType: 'other' }, file })).status, 409);
  w.agents[100].verification_status = 'unverified';
  for (let i = 0; i < 19; i += 1) w.addDoc({});
  assert.equal((await call(c.verification.uploadMyDocument, { user: as(A), body: { documentType: 'other' }, file })).status, 409, 'cap of 20');
});

test('verification status: agents only see their own documents, without reviewer ids', async () => {
  const { w, c, as } = setup();
  w.addDoc({ status: 'rejected', rejection_reason: 'Illegible', reviewed_by: 77 }); w.addDoc({ agent_id: 200 });
  const r = await call(c.verification.getMyVerificationStatus, { user: as(A) });
  const d = r.body.data; assert.equal(r.status, 200);
  assert.equal(d.documents.length, 1); assert.equal(d.documents[0].rejection_reason, 'Illegible');
  assert.equal('reviewed_by' in d.documents[0], false, 'admin identity is not exposed');
  assert.equal(d.canSubmit, false); assert.deepEqual(d.missingForSubmission, ['a license document', 'your license expiry date']);
  assert.equal(d.canEditLicenseExpiry, true);
  assert.equal((await call(c.verification.getMyVerificationStatus, { user: as(BUYER) })).status, 404);
});

test('submit for review: requires a usable license doc + expiry; moves unverified/rejected -> pending only', async () => {
  const { w, c, as } = setup();
  let r = await call(c.verification.submitMyVerification, { user: as(A) });
  assert.equal(r.status, 400); assert.deepEqual(r.body.details.missing, ['a license document', 'your license expiry date']);
  w.addDoc({ status: 'rejected' }); w.agents[100].license_expiry_date = '2027-05-01';
  assert.equal((await call(c.verification.submitMyVerification, { user: as(A) })).status, 400, 'a rejected license does not count');
  w.addDoc({ document_type: 'id_proof' });
  assert.equal((await call(c.verification.submitMyVerification, { user: as(A) })).status, 400, 'an ID is not a license');
  w.addDoc({});   // pending license
  r = await call(c.verification.submitMyVerification, { user: as(A) });
  assert.equal(r.status, 200); assert.equal(r.body.data.verificationStatus, 'pending'); assert.equal(w.agents[100].verification_status, 'pending');
  r = await call(c.verification.submitMyVerification, { user: as(A) }); assert.equal(r.status, 409); assert.equal(r.body.details.code, 'ALREADY_PENDING');
  w.agents[100].verification_status = 'verified';
  assert.equal((await call(c.verification.submitMyVerification, { user: as(A) })).body.details.code, 'ALREADY_VERIFIED');
  w.agents[100].verification_status = 'rejected';
  assert.equal((await call(c.verification.submitMyVerification, { user: as(A) })).status, 200, 'a rejected agent can resubmit');
  assert.equal(w.agents[200].verification_status, 'unverified', 'other agents untouched');
  w.agents[100].verification_status = 'unverified'; w.raceLoss = true;
  assert.equal((await call(c.verification.submitMyVerification, { user: as(A) })).body.details.code, 'STATUS_CHANGED');
});

test('deleting verification documents: own only, respecting review state; file removed from disk', async () => {
  const { w, c, as } = setup(); const del = (uid, id) => call(c.verification.deleteMyDocument, { user: as(uid), params: { documentId: String(id) } });
  const f = w.realFile('documents', 'del-test-a.pdf');
  const pending = w.addDoc({ file_url: f.url }); const rejected = w.addDoc({ status: 'rejected' }); const verified = w.addDoc({ status: 'verified' });
  const others = w.addDoc({ agent_id: 200 }); const renewalDoc = w.addDoc({ renewal_id: 555 });
  try {
    assert.equal((await del(B, pending.document_id)).status, 404, 'Agent B cannot even see Agent A’s document');
    assert.equal((await del(A, others.document_id)).status, 404, 'A cannot delete B’s document');
    assert.equal((await del(A, renewalDoc.document_id)).status, 404, 'renewal documents use the renewals endpoint');
    assert.equal((await del(BUYER, pending.document_id)).status, 404, 'buyers have no agent profile');
    assert.equal((await del(A, verified.document_id)).status, 409, 'verified documents are permanent');
    w.agents[100].verification_status = 'pending';
    assert.equal((await del(A, pending.document_id)).status, 409, 'pending docs are locked while under review');
    assert.equal((await del(A, rejected.document_id)).status, 200, 'rejected docs can always be replaced');
    w.agents[100].verification_status = 'unverified';
    assert.equal((await del(A, pending.document_id)).status, 200);
    assert.equal(fs.existsSync(f.abs), false, 'file deleted from disk');
    assert.equal(w.docs.some((d) => d.document_id === others.document_id), true);
  } finally { w.cleanup(); }
});

// ================================================================= license expiry + reviews
test('license expiry is self-declared until verified, then locked (other profile fields still editable)', async () => {
  const { w, c, as } = setup(); const put = (body) => call(c.agent.updateMyAgentProfile, { user: as(A), body });
  assert.equal((await put({ licenseExpiryDate: '2027-01-31', agencyName: 'New Realty' })).status, 200);
  assert.equal(w.agents[100].license_expiry_date, '2027-01-31'); assert.equal(w.agents[100].agency_name, 'New Realty');
  w.agents[100].verification_status = 'verified';
  const locked = await put({ licenseExpiryDate: '2035-01-31' });
  assert.equal(locked.status, 403); assert.equal(locked.body.details.code, 'EXPIRY_LOCKED'); assert.equal(w.agents[100].license_expiry_date, '2027-01-31');
  assert.equal((await put({ agencyName: 'Renamed' })).status, 200); assert.equal(w.agents[100].agency_name, 'Renamed');
  assert.equal((await call(c.agent.updateMyAgentProfile, { user: as(BUYER), body: { agencyName: 'x' } })).status, 404);
});

test('agent reviews: an agent cannot review themselves; others can, once', async () => {
  const { w, c, as } = setup(); const review = (uid, agentId) => call(c.agent.createAgentReview, { user: as(uid), params: { id: String(agentId) }, body: { rating: 5 } });
  const self = await review(A, 100); assert.equal(self.status, 403); assert.equal(self.body.details.code, 'OWN_PROFILE'); assert.equal(w.reviews.length, 0);
  assert.equal((await review(BUYER, 100)).status, 201);
  assert.equal((await review(BUYER, 100)).status, 409);
  assert.equal((await review(B, 100)).status, 201, 'another agent may review');
});

// ================================================================= renewals
test('renewal start: needs an expiry on file; only one renewal in progress', async () => {
  const { w, c, as } = setup(); const start = (uid = A) => call(c.renewal.createRenewal, { user: as(uid) });
  assert.equal((await start()).status, 400); assert.equal(w.renewals.length, 0);
  w.agents[100].license_expiry_date = '2026-12-31';
  const first = await start(); assert.equal(first.status, 201); assert.equal(first.body.data.renewal.status, 'draft');
  const dup = await start(); assert.equal(dup.status, 409); assert.equal(dup.body.details.code, 'RENEWAL_ALREADY_OPEN'); assert.equal(dup.body.details.renewalId, first.body.data.renewal.renewal_id);
  assert.equal(w.renewals.length, 1);
  w.renewals[0].status = 'approved';
  assert.equal((await start()).status, 201, 'a new renewal is allowed once the previous one is finished');
  assert.equal((await start(BUYER)).status, 404);
});

test('renewal documents: own renewal only, only while the agent can still edit it', async () => {
  const { w, c, as } = setup(); const file = { filename: 'r.pdf' };
  const mine = w.addRenewal({}); const theirs = w.addRenewal({ agent_id: 200 });
  const up = (uid, rid, body = { documentType: 'license' }, f = file) => call(c.renewal.uploadRenewalDocument, { user: as(uid), params: { id: String(rid) }, body, file: f });
  assert.equal((await up(A, mine.renewal_id)).status, 201); assert.equal(mine.status, 'documents_pending'); assert.equal(w.docs.at(-1).agent_id, 100);
  assert.equal((await up(A, theirs.renewal_id)).status, 404, 'Agent A cannot upload to Agent B’s renewal');
  assert.equal((await up(B, mine.renewal_id)).status, 404, 'Agent B cannot upload to Agent A’s renewal');
  assert.equal((await up(BUYER, mine.renewal_id)).status, 404);
  assert.equal((await up(A, mine.renewal_id, { documentType: 'banana' })).status, 400);
  assert.equal((await up(A, mine.renewal_id, { documentType: 'license' }, null)).status, 400, 'no file');
  for (const status of ['submitted', 'under_review', 'approved', 'rejected']) {
    mine.status = status;
    const r = await up(A, mine.renewal_id); assert.equal(r.status, 409, status); assert.equal(r.body.details.code, 'RENEWAL_LOCKED');
  }
  mine.status = 'missing_documents'; assert.equal((await up(A, mine.renewal_id)).status, 201, 'the missing-documents flow allows uploads');
  assert.equal(mine.status, 'missing_documents');
});

test('renewal submit: strict state machine, needs documents, no unresolved rejections', async () => {
  const { w, c, as } = setup(); const submit = (uid, rid) => call(c.renewal.submitRenewal, { user: as(uid), params: { id: String(rid) } });
  const r = w.addRenewal({});
  let res = await submit(A, r.renewal_id); assert.equal(res.status, 400); assert.equal(res.body.details.code, 'NO_DOCUMENTS');
  const good = w.addDoc({ renewal_id: r.renewal_id }); const bad = w.addDoc({ renewal_id: r.renewal_id, status: 'rejected' });
  res = await submit(A, r.renewal_id); assert.equal(res.status, 409); assert.equal(res.body.details.code, 'REJECTED_DOCUMENTS_REMAIN'); assert.equal(r.status, 'draft');
  w.docs.splice(w.docs.indexOf(bad), 1);
  assert.equal((await submit(B, r.renewal_id)).status, 404, 'Agent B cannot submit Agent A’s renewal');
  assert.equal((await submit(BUYER, r.renewal_id)).status, 404);
  assert.equal(r.status, 'draft');
  res = await submit(A, r.renewal_id); assert.equal(res.status, 200); assert.equal(r.status, 'submitted');
  for (const status of ['submitted', 'under_review', 'approved', 'rejected']) {
    r.status = status; res = await submit(A, r.renewal_id);
    assert.equal(res.status, 409, status); assert.equal(res.body.details.code, 'RENEWAL_NOT_SUBMITTABLE'); assert.equal(r.status, status, `${status} is never overwritten`);
  }
  r.status = 'missing_documents'; assert.equal((await submit(A, r.renewal_id)).status, 200, 'resubmission after a missing-documents request');
  r.status = 'draft'; w.raceLoss = true; assert.equal((await submit(A, r.renewal_id)).body.details.code, 'RENEWAL_CHANGED');
  assert.ok(good);
});

test('renewal document deletion: own docs on own editable renewal only; file removed', async () => {
  const { w, c, as } = setup(); const del = (uid, rid, did) => call(c.renewal.deleteRenewalDocument, { user: as(uid), params: { id: String(rid), documentId: String(did) } });
  const f = w.realFile('documents', 'renewal-del-test.pdf');
  const r = w.addRenewal({ status: 'missing_documents' }); const other = w.addRenewal({ agent_id: 200 });
  const rej = w.addDoc({ renewal_id: r.renewal_id, status: 'rejected', file_url: f.url }); const ver = w.addDoc({ renewal_id: r.renewal_id, status: 'verified' });
  const foreign = w.addDoc({ agent_id: 200, renewal_id: other.renewal_id }); const initial = w.addDoc({});
  try {
    assert.equal((await del(B, r.renewal_id, rej.document_id)).status, 404);
    assert.equal((await del(A, other.renewal_id, foreign.document_id)).status, 404);
    assert.equal((await del(A, r.renewal_id, foreign.document_id)).status, 404, 'a document from another renewal is not reachable through this one');
    assert.equal((await del(A, r.renewal_id, initial.document_id)).status, 404, 'initial-verification documents are not renewal documents');
    assert.equal((await del(A, r.renewal_id, ver.document_id)).status, 409, 'verified stays');
    r.status = 'submitted'; assert.equal((await del(A, r.renewal_id, rej.document_id)).status, 409, 'locked once submitted');
    r.status = 'missing_documents'; assert.equal((await del(A, r.renewal_id, rej.document_id)).status, 200);
    assert.equal(fs.existsSync(f.abs), false);
  } finally { w.cleanup(); }
});

test('my renewals: only the caller’s, each with its own documents (no reviewer ids)', async () => {
  const { w, c, as } = setup();
  const mine = w.addRenewal({}); const theirs = w.addRenewal({ agent_id: 200 });
  w.addDoc({ renewal_id: mine.renewal_id, status: 'rejected', rejection_reason: 'Expired' }); w.addDoc({ agent_id: 200, renewal_id: theirs.renewal_id });
  const r = await call(c.renewal.getMyRenewals, { user: as(A) });
  assert.equal(r.body.data.renewals.length, 1); assert.equal(r.body.data.renewals[0].renewal_id, mine.renewal_id);
  assert.equal(r.body.data.renewals[0].documents.length, 1); assert.equal(r.body.data.renewals[0].documents[0].rejection_reason, 'Expired');
  assert.equal('reviewed_by' in r.body.data.renewals[0].documents[0], false);
  assert.equal((await call(c.renewal.getMyRenewals, { user: as(BUYER) })).status, 404);
});

// ================================================================= inquiries
test('inquiries: only the receiving agent (or admin) may act on an inquiry', async () => {
  const { w, c, as } = setup();
  w.inquiries.push({ inquiry_id: 1, agent_id: 100, user_id: 1, status: 'new' }, { inquiry_id: 2, agent_id: 200, user_id: 2, status: 'new' });
  const upd = (uid, id, status) => call(c.inquiry.updateInquiryStatus, { user: as(uid), params: { id: String(id) }, body: { status } });
  assert.equal((await upd(B, 1, 'closed')).status, 403, 'Agent B cannot touch Agent A’s inquiry');
  assert.equal((await upd(BUYER, 1, 'closed')).status, 403);
  assert.equal((await upd(A, 2, 'closed')).status, 403);
  assert.equal(w.inquiries[0].status, 'new');
  assert.equal((await upd(A, 1, 'contacted')).status, 200); assert.equal(w.inquiries[0].status, 'contacted');
  assert.equal((await upd(ADMIN, 2, 'closed')).status, 200);
  assert.equal((await upd(A, 99, 'closed')).status, 404);
  const list = await call(c.inquiry.getReceivedInquiries, { user: as(A) });
  assert.deepEqual(list.body.data.inquiries.map((i) => i.inquiry_id), [1], 'Agent A only receives their own inquiries');
  assert.equal((await call(c.inquiry.getReceivedInquiries, { user: as(BUYER) })).status, 404);
});
