// tests/adminPortal.test.js
// Covers the Admin Portal phase additions on top of the real controllers:
//   - property/verification-document/agent/license-renewal transition guards (compare-and-set)
//   - admin.controller self-protection and peer-admin protection
//   - the requirePermission middleware's permission matrix
// Uses the same in-memory world/stub technique as tests/agentPortal.test.js — no MySQL involved.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { makeAgentWorld, loadAgentControllers, call, asUser } = require('./helpers/agentWorld');

function setup(extra) {
  const world = makeAgentWorld();
  if (extra) extra(world);
  const controllers = loadAgentControllers(world);
  return { world, controllers };
}

// ---------------------------------------------------------------------------
// Property moderation transition guard
// ---------------------------------------------------------------------------

test('admin approveProperty: applies from pending_review, 409 otherwise', async () => {
  const { world, controllers } = setup();
  const ok = await call(controllers.property.approveProperty, { user: asUser(world, 5), params: { id: '13' } }); // 13 = pending_review
  assert.equal(ok.status, 200);
  assert.equal(world.properties[13].status, 'active');

  const already = await call(controllers.property.approveProperty, { user: asUser(world, 5), params: { id: '10' } }); // 10 = already active
  assert.equal(already.status, 409);
  assert.equal(already.body.details?.code, 'INVALID_TRANSITION');
});

test('admin rejectProperty: applies from pending_review, 409 for an already-decided listing', async () => {
  const { world, controllers } = setup();
  const ok = await call(controllers.property.rejectProperty, {
    user: asUser(world, 5), params: { id: '13' }, body: { reason: 'Missing permit documents' },
  });
  assert.equal(ok.status, 200);
  assert.equal(world.properties[13].status, 'rejected');

  const alreadyRejected = await call(controllers.property.rejectProperty, {
    user: asUser(world, 5), params: { id: '12' }, body: { reason: 'Again' }, // 12 = already rejected
  });
  assert.equal(alreadyRejected.status, 409);
});

test('admin approveProperty: cannot re-approve a sold/archived/under_contract listing', async () => {
  const { world, controllers } = setup();
  for (const pid of [15, 16, 17]) { // sold, under_contract, archived
    // eslint-disable-next-line no-await-in-loop
    const res = await call(controllers.property.approveProperty, { user: asUser(world, 5), params: { id: String(pid) } });
    assert.equal(res.status, 409, `property ${pid} should not be approvable`);
  }
});

// ---------------------------------------------------------------------------
// License renewal state machine (submitted -> under_review -> approved/rejected/missing_documents)
// ---------------------------------------------------------------------------

test('license renewal: approve/reject/request-documents require under_review first', async () => {
  const { world, controllers } = setup((w) => w.addRenewal({ renewal_id: 900, status: 'submitted' }));

  const skipReview = await call(controllers.renewal.approveRenewal, {
    user: asUser(world, 5), params: { id: '900' }, body: { newExpiryDate: '2027-01-01' },
  });
  assert.equal(skipReview.status, 409, 'approving straight from submitted must be rejected');

  const moved = await call(controllers.renewal.moveToUnderReview, { user: asUser(world, 5), params: { id: '900' } });
  assert.equal(moved.status, 200);
  assert.equal(world.renewals.find((r) => r.renewal_id === 900).status, 'under_review');

  const repeat = await call(controllers.renewal.moveToUnderReview, { user: asUser(world, 5), params: { id: '900' } });
  assert.equal(repeat.status, 409, 'cannot move to under_review twice');

  const approved = await call(controllers.renewal.approveRenewal, {
    user: asUser(world, 5), params: { id: '900' }, body: { newExpiryDate: '2027-01-01' },
  });
  assert.equal(approved.status, 200);
  assert.equal(world.renewals.find((r) => r.renewal_id === 900).status, 'approved');
  assert.equal(world.agents[100].license_expiry_date, '2027-01-01', 'agent license_expiry_date must update on approval');

  const doubleApprove = await call(controllers.renewal.approveRenewal, {
    user: asUser(world, 5), params: { id: '900' }, body: { newExpiryDate: '2028-01-01' },
  });
  assert.equal(doubleApprove.status, 409, 'cannot approve an already-approved renewal');
});

test('license renewal: reject and request-documents also require under_review', async () => {
  const { world, controllers } = setup((w) => {
    w.addRenewal({ renewal_id: 901, status: 'submitted' });
    w.addRenewal({ renewal_id: 902, status: 'submitted' });
  });

  const rejectTooEarly = await call(controllers.renewal.rejectRenewal, { user: asUser(world, 5), params: { id: '901' } });
  assert.equal(rejectTooEarly.status, 409);

  await call(controllers.renewal.moveToUnderReview, { user: asUser(world, 5), params: { id: '901' } });
  const reject = await call(controllers.renewal.rejectRenewal, { user: asUser(world, 5), params: { id: '901' } });
  assert.equal(reject.status, 200);
  assert.equal(world.renewals.find((r) => r.renewal_id === 901).status, 'rejected');

  await call(controllers.renewal.moveToUnderReview, { user: asUser(world, 5), params: { id: '902' } });
  const missing = await call(controllers.renewal.requestMoreDocuments, { user: asUser(world, 5), params: { id: '902' } });
  assert.equal(missing.status, 200);
  assert.equal(world.renewals.find((r) => r.renewal_id === 902).status, 'missing_documents');
});

// ---------------------------------------------------------------------------
// Verification document + agent verification transition guards
// ---------------------------------------------------------------------------

test('verification: a document can only be reviewed once', async () => {
  const { world, controllers } = setup((w) => w.addDoc({ document_id: 500, status: 'pending' }));

  const first = await call(controllers.verification.verifyDocument, { user: asUser(world, 5), params: { documentId: '500' } });
  assert.equal(first.status, 200);

  const again = await call(controllers.verification.rejectDocument, {
    user: asUser(world, 5), params: { documentId: '500' }, body: { reason: 'changed my mind' },
  });
  assert.equal(again.status, 409);
});

test('verification: an agent can only be verified/rejected while pending', async () => {
  const { world, controllers } = setup((w) => { w.agents[100].verification_status = 'unverified'; });

  const tooEarly = await call(controllers.verification.verifyAgent, { user: asUser(world, 5), params: { agentId: '100' } });
  assert.equal(tooEarly.status, 409, 'cannot verify an agent that never submitted for review');

  world.agents[100].verification_status = 'pending';
  const ok = await call(controllers.verification.verifyAgent, { user: asUser(world, 5), params: { agentId: '100' } });
  assert.equal(ok.status, 200);
  assert.equal(world.agents[100].verification_status, 'verified');

  const doubleDecision = await call(controllers.verification.rejectAgent, { user: asUser(world, 5), params: { agentId: '100' } });
  assert.equal(doubleDecision.status, 409, 'an already-verified agent cannot then be rejected');
});

test('verification: document file access is owner-or-admin only, and 404s (not 403) for a stranger', async () => {
  const { world, controllers } = setup((w) => w.addDoc({ document_id: 501, agent_id: 100, status: 'pending' }));

  const owner = await call(controllers.verification.getDocumentFile, { user: asUser(world, 3), params: { documentId: '501' } }); // user 3 = agent 100
  assert.equal(owner.status, 200);

  const admin = await call(controllers.verification.getDocumentFile, { user: asUser(world, 5), params: { documentId: '501' } });
  assert.equal(admin.status, 200);

  const stranger = await call(controllers.verification.getDocumentFile, { user: asUser(world, 4), params: { documentId: '501' } }); // user 4 = agent 200, not the owner
  assert.equal(stranger.status, 404, 'a non-owning agent must get 404, never a peek via 403');
});

// ---------------------------------------------------------------------------
// admin.controller: self-protection and peer-admin protection on updateUserStatus
// ---------------------------------------------------------------------------

test('admin cannot change their own account status', async () => {
  const { world, controllers } = setup();
  const res = await call(controllers.admin.updateUserStatus, {
    user: asUser(world, 5), params: { id: '5' }, body: { status: 'suspended' },
  });
  assert.equal(res.status, 409);
  assert.equal(res.body.details?.code, 'SELF_TARGET');
});

test('a moderator admin cannot change another admin\'s status; a super_admin can', async () => {
  const { world, controllers } = setup((w) => {
    w.users[6] = { user_id: 6, role: 'admin', first_name: 'Mo', last_name: 'Moderator', status: 'active' };
    w.adminUsers[6] = { admin_id: 2, user_id: 6, permission_level: 'moderator' };
    w.users[7] = { user_id: 7, role: 'admin', first_name: 'Sam', last_name: 'SuperTwo', status: 'active' };
    w.adminUsers[7] = { admin_id: 3, user_id: 7, permission_level: 'super_admin' };
  });

  const byModerator = await call(controllers.admin.updateUserStatus, {
    user: asUser(world, 6), params: { id: '7' }, body: { status: 'suspended' },
  });
  assert.equal(byModerator.status, 403);
  assert.equal(world.users[7].status, 'active', 'status must be unchanged after the 403');

  const bySuperAdmin = await call(controllers.admin.updateUserStatus, {
    user: asUser(world, 5), params: { id: '7' }, body: { status: 'suspended' },
  });
  assert.equal(bySuperAdmin.status, 200);
  assert.equal(world.users[7].status, 'suspended');
});

test('a moderator admin CAN suspend an ordinary buyer/agent', async () => {
  const { world, controllers } = setup((w) => {
    w.users[6] = { user_id: 6, role: 'admin', first_name: 'Mo', last_name: 'Moderator', status: 'active' };
    w.adminUsers[6] = { admin_id: 2, user_id: 6, permission_level: 'moderator' };
    w.users[1].status = 'active';
  });
  const res = await call(controllers.admin.updateUserStatus, {
    user: asUser(world, 6), params: { id: '1' }, body: { status: 'suspended' },
  });
  assert.equal(res.status, 200);
  assert.equal(world.users[1].status, 'suspended');
});

// ---------------------------------------------------------------------------
// requirePermission middleware (exercised directly — the in-memory world's call() helper bypasses
// Express routing/middleware entirely, so this is tested as a standalone unit instead).
// ---------------------------------------------------------------------------

function loadRequirePermission(world) {
  const SRC = path.join(__dirname, '..', 'src');
  const f = require.resolve(path.join(SRC, 'models', 'adminUser.model.js'));
  require.cache[f] = { id: f, filename: f, loaded: true, exports: world.models.adminUser, children: [], paths: [] };
  const mf = require.resolve(path.join(SRC, 'middleware', 'requirePermission.js'));
  delete require.cache[mf];
  return require(mf);
}

function callMiddleware(mw, req) {
  return new Promise((resolve, reject) => {
    const res = { code: 200, status(c) { this.code = c; return this; }, json(b) { resolve({ status: this.code, body: b }); return this; } };
    const next = () => resolve({ status: 'next', body: null });
    Promise.resolve(mw(req, res, next)).catch(reject);
  });
}

test('requirePermission: allows a listed level and sets req.admin; blocks others with 403', async () => {
  const world = makeAgentWorld();
  world.adminUsers[6] = { admin_id: 2, user_id: 6, permission_level: 'moderator' };
  world.adminUsers[7] = { admin_id: 3, user_id: 7, permission_level: 'support' };
  const requirePermission = loadRequirePermission(world);
  const mw = requirePermission('super_admin', 'moderator');

  const req1 = { user: { userId: 6 } };
  const allowed = await callMiddleware(mw, req1);
  assert.equal(allowed.status, 'next');
  assert.equal(req1.admin.permission_level, 'moderator');

  const req2 = { user: { userId: 7 } };
  const blocked = await callMiddleware(mw, req2);
  assert.equal(blocked.status, 403);
});

test('requirePermission: 403 when the authenticated user has no admin_users row', async () => {
  const world = makeAgentWorld();
  const requirePermission = loadRequirePermission(world);
  const mw = requirePermission('super_admin');
  const res = await callMiddleware(mw, { user: { userId: 999 } });
  assert.equal(res.status, 403);
});
