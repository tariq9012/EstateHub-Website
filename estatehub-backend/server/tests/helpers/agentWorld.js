// In-memory model layer for the agent-portal controllers (property, verification, renewal, agent, inquiry).
// Lets the REAL controllers run without MySQL. NOTE: the model SQL itself is NOT exercised here.
const path = require('node:path');
const fs = require('node:fs');
const SRC = path.join(__dirname, '..', '..', 'src');
const { UPLOAD_ROOT } = require('../../src/config/paths');

function makeAgentWorld() {
  const w = {
    users: {
      1: { user_id: 1, role: 'buyer', first_name: 'Bella', last_name: 'Buyer' },
      2: { user_id: 2, role: 'buyer', first_name: 'Ben', last_name: 'Buyer' },
      3: { user_id: 3, role: 'agent', first_name: 'Aaron', last_name: 'Agent' },
      4: { user_id: 4, role: 'agent', first_name: 'Dana', last_name: 'Dealer' },
      5: { user_id: 5, role: 'admin', first_name: 'Ada', last_name: 'Admin' },
    },
    agents: {
      100: { agent_id: 100, user_id: 3, license_number: 'L-100', agency_name: 'A Realty', verification_status: 'unverified', license_expiry_date: null },
      200: { agent_id: 200, user_id: 4, license_number: 'L-200', agency_name: 'D Realty', verification_status: 'unverified', license_expiry_date: null },
    },
    // admin_users rows, keyed by user_id. Test 5 (Ada) is super_admin by default; tests can add
    // more (e.g. a moderator or support admin) by pushing onto this map before loadAgentControllers.
    adminUsers: {
      5: { admin_id: 1, user_id: 5, permission_level: 'super_admin' },
    },
    actionLog: [],
    properties: {},
    images: [],
    docs: [],
    renewals: [],
    inquiries: [],
    reviews: [],
    notifications: [],
    files: [],           // absolute paths of real temp files created for deletion tests
    nextId: 1000,
    raceLoss: false,     // makes CAS operations behave as if someone else won
  };
  const id = () => (w.nextId += 1);

  const prop = (property_id, agent_id, status, extra = {}) => {
    const listed = agent_id === 100 ? 3 : 4;
    w.properties[property_id] = { property_id, agent_id, listed_by_user_id: listed, status, title: `P${property_id}`, price: 100, rejection_reason: status === 'rejected' ? 'Photos are blurry' : null, ...extra };
  };
  prop(10, 100, 'active'); prop(11, 100, 'draft'); prop(12, 100, 'rejected'); prop(13, 100, 'pending_review'); prop(14, 200, 'active');
  prop(15, 100, 'sold'); prop(16, 100, 'under_contract'); prop(17, 100, 'archived');

  w.addDoc = (o) => { const d = { document_id: id(), agent_id: 100, renewal_id: null, document_type: 'license', file_url: `/uploads/documents/seed${w.nextId}.pdf`, status: 'pending', rejection_reason: null, reviewed_by: 9, reviewed_at: null, uploaded_at: '2026-09-01 10:00:00', ...o }; w.docs.push(d); return d; };
  w.addRenewal = (o) => { const r = { renewal_id: id(), agent_id: 100, current_license_expiry: '2026-12-31', status: 'draft', submitted_at: null, new_expiry_date: null, ...o }; w.renewals.push(r); return r; };
  w.addImage = (property_id, o = {}) => { const i = { image_id: id(), property_id, image_url: `/uploads/properties/seed${w.nextId}.jpg`, is_primary: false, display_order: w.images.filter((x) => x.property_id === property_id).length, ...o }; w.images.push(i); return i; };
  /** Creates a REAL file under the upload root so deletion can be observed. Returns { url, abs }. */
  w.realFile = (sub, name) => { const dir = path.join(UPLOAD_ROOT, sub); fs.mkdirSync(dir, { recursive: true }); const abs = path.join(dir, name); fs.writeFileSync(abs, 'x'); w.files.push(abs); return { url: `/uploads/${sub}/${name}`, abs }; };
  w.cleanup = () => w.files.forEach((f) => { try { fs.unlinkSync(f); } catch (e) { /* already deleted */ } });

  const imgs = (pid) => w.images.filter((i) => i.property_id === pid).sort((a, b) => a.display_order - b.display_order);
  const ownDocs = (pred) => w.docs.filter(pred).sort((a, b) => b.document_id - a.document_id);

  w.models = {
    property: {
      findOwnerInfo: async (pid) => { const p = w.properties[pid]; return p ? { property_id: p.property_id, listed_by_user_id: p.listed_by_user_id, agent_id: p.agent_id, status: p.status } : null; },
      findById: async (pid) => { const p = w.properties[pid]; return p ? { ...p, images: imgs(pid), amenities: [] } : null; },
      findByAgent: async (agentId) => Object.values(w.properties).filter((p) => p.agent_id === agentId).map((p) => ({ ...p, image_count: imgs(p.property_id).length, inquiry_count: w.inquiries.filter((i) => i.property_id === p.property_id).length, primary_image_url: (imgs(p.property_id).find((i) => i.is_primary) || {}).image_url || null })),
      // executor (a transaction connection) is accepted for signature-compatibility but unused — this stub writes straight to the in-memory world.
      createProperty: async (executor, fields) => {
        const pid = id();
        w.properties[pid] = {
          property_id: pid, listed_by_user_id: fields.listedByUserId, agent_id: fields.agentId || null,
          status: fields.status === 'draft' ? 'draft' : 'pending_review', title: fields.title, price: fields.price,
          listing_type: fields.listingType || 'sale', bedrooms: fields.bedrooms ?? null, bathrooms: fields.bathrooms ?? null,
          area_sqft: fields.areaSqft ?? null, description: fields.description || null, address_line: fields.addressLine,
          city: 'Austin', rejection_reason: null,
        };
        return pid;
      },
      updateProperty: async (pid, fields) => { Object.assign(w.properties[pid], fields); return true; },
      transitionStatus: async (pid, from, to, { clearRejection = false } = {}) => {
        if (w.raceLoss) return false; const p = w.properties[pid];
        if (!p || p.status !== from) return false; p.status = to; if (clearRejection) p.rejection_reason = null; return true;
      },
      // Mirrors the real compare-and-set model: only applies (and returns true) from 'pending_review'.
      approveProperty: async (pid) => {
        if (w.raceLoss) return false; const p = w.properties[pid];
        if (!p || p.status !== 'pending_review') return false;
        p.status = 'active'; p.rejection_reason = null; return true;
      },
      rejectProperty: async (pid, adminId, reason) => {
        if (w.raceLoss) return false; const p = w.properties[pid];
        if (!p || p.status !== 'pending_review') return false;
        p.status = 'rejected'; p.rejection_reason = reason; return true;
      },
      archiveProperty: async (pid) => { w.properties[pid].status = 'archived'; },
      incrementViewCount: async () => {},
    },
    propertyImage: {
      countByProperty: async (pid) => imgs(pid).length,
      addImages: async (pid, list) => { list.forEach((i, n) => w.addImage(pid, { image_url: i.imageUrl, is_primary: imgs(pid).length === 0 && n === 0 })); },
      listByProperty: async (pid) => imgs(pid),
      deleteImage: async (imageId, pid) => { const i = w.images.find((x) => x.image_id === imageId && x.property_id === pid); if (!i) return null; w.images.splice(w.images.indexOf(i), 1); return i; },
      ensurePrimary: async (pid) => { const l = imgs(pid); if (l.length && !l.some((x) => x.is_primary)) l[0].is_primary = true; },
      setPrimary: async (imageId, pid) => { const i = w.images.find((x) => x.image_id === imageId && x.property_id === pid); if (!i) return false; imgs(pid).forEach((x) => { x.is_primary = false; }); i.is_primary = true; return true; },
    },
    location: { findOrCreate: async (executor, opts) => 1 },
    propertyAmenity: { setForProperty: async () => {}, listForProperty: async () => [] },
    agent: {
      findByUserId: async (uid) => Object.values(w.agents).find((a) => a.user_id === uid) || null,
      findFullById: async (aid) => { const a = w.agents[aid]; return a ? { ...a, ...w.users[a.user_id] } : null; },
      updateAgentFields: async (aid, f) => { Object.entries(f).forEach(([k, v]) => { if (v !== undefined) w.agents[aid][k] = v; }); return true; },
      submitForVerification: async (aid) => { if (w.raceLoss) return false; const a = w.agents[aid]; if (!['unverified', 'rejected'].includes(a.verification_status)) return false; a.verification_status = 'pending'; return true; },
      verifyAgent: async (aid, verifiedBy) => { if (w.raceLoss) return false; const a = w.agents[aid]; if (!a || a.verification_status !== 'pending') return false; a.verification_status = 'verified'; a.verified_by = verifiedBy; a.verified_at = 'now'; return true; },
      rejectAgentVerification: async (aid, verifiedBy) => { if (w.raceLoss) return false; const a = w.agents[aid]; if (!a || a.verification_status !== 'pending') return false; a.verification_status = 'rejected'; a.verified_by = verifiedBy; return true; },
      updateLicenseExpiry: async (aid, newExpiryDate) => { w.agents[aid].license_expiry_date = newExpiryDate; },
      listByVerificationStatus: async (status) => Object.values(w.agents).filter((a) => a.verification_status === status),
      findById: async (aid) => w.agents[aid] || null,
    },
    agentProfile: { upsert: async () => {} },
    agentReview: {
      create: async ({ agentId, userId, rating, comment }) => {
        if (w.reviews.some((r) => r.agent_id === agentId && r.user_id === userId)) return false;
        const u = w.users[userId];
        w.reviews.push({ review_id: id(), agent_id: agentId, user_id: userId, rating, comment: comment || null, created_at: '2026-09-21 12:00:00', first_name: u.first_name, last_name: u.last_name });
        return true;
      },
      listForAgent: async (aid) => w.reviews.filter((r) => r.agent_id === aid),
      recalculateAgentRating: async (aid) => {
        const rs = w.reviews.filter((r) => r.agent_id === aid);
        const avg = rs.length ? rs.reduce((sum, r) => sum + r.rating, 0) / rs.length : 0;
        w.agents[aid].average_rating = avg;
        w.agents[aid].total_reviews = rs.length;
      },
    },
    verificationDocument: {
      createDocument: async ({ agentId, renewalId, documentType, fileUrl }) => w.addDoc({ agent_id: agentId, renewal_id: renewalId || null, document_type: documentType, file_url: fileUrl }).document_id,
      listInitialVerificationDocs: async (aid) => ownDocs((d) => d.agent_id === aid && d.renewal_id === null),
      listForRenewal: async (rid) => ownDocs((d) => d.renewal_id === rid),
      findById: async (did) => w.docs.find((d) => d.document_id === did) || null,
      deleteDocument: async (did) => { const d = w.docs.find((x) => x.document_id === did); if (!d) return false; w.docs.splice(w.docs.indexOf(d), 1); return true; },
      countForAgentInitial: async (aid) => w.docs.filter((d) => d.agent_id === aid && d.renewal_id === null).length,
      countForRenewal: async (rid) => w.docs.filter((d) => d.renewal_id === rid).length,
      verifyDocument: async (did) => { if (w.raceLoss) return false; const d = w.docs.find((x) => x.document_id === did); if (!d || d.status !== 'pending') return false; d.status = 'verified'; d.rejection_reason = null; return true; },
      rejectDocument: async (did, reviewedBy, reason) => { if (w.raceLoss) return false; const d = w.docs.find((x) => x.document_id === did); if (!d || d.status !== 'pending') return false; d.status = 'rejected'; d.rejection_reason = reason; return true; },
    },
    licenseRenewal: {
      create: async (agentId, expiry) => w.addRenewal({ agent_id: agentId, current_license_expiry: expiry }).renewal_id,
      findById: async (rid) => w.renewals.find((r) => r.renewal_id === rid) || null,
      listForAgent: async (aid) => w.renewals.filter((r) => r.agent_id === aid),
      findOpenByAgent: async (aid) => w.renewals.filter((r) => r.agent_id === aid && ['draft', 'documents_pending', 'submitted', 'under_review', 'missing_documents'].includes(r.status)).pop() || null,
      markDocumentsPending: async (rid) => { const r = w.renewals.find((x) => x.renewal_id === rid); if (r && r.status === 'draft') r.status = 'documents_pending'; },
      submitIfStatus: async (rid, allowed) => { if (w.raceLoss) return false; const r = w.renewals.find((x) => x.renewal_id === rid); if (!r || !allowed.includes(r.status)) return false; r.status = 'submitted'; r.submitted_at = 'now'; return true; },
      listAll: async ({ status } = {}) => w.renewals.filter((r) => !status || r.status === status),
      moveToUnderReview: async (rid, reviewedBy) => { if (w.raceLoss) return false; const r = w.renewals.find((x) => x.renewal_id === rid); if (!r || r.status !== 'submitted') return false; r.status = 'under_review'; r.reviewed_by = reviewedBy; return true; },
      approve: async (rid, reviewedBy, newExpiryDate) => { if (w.raceLoss) return false; const r = w.renewals.find((x) => x.renewal_id === rid); if (!r || r.status !== 'under_review') return false; r.status = 'approved'; r.reviewed_by = reviewedBy; r.new_expiry_date = newExpiryDate; return true; },
      reject: async (rid, reviewedBy) => { if (w.raceLoss) return false; const r = w.renewals.find((x) => x.renewal_id === rid); if (!r || r.status !== 'under_review') return false; r.status = 'rejected'; r.reviewed_by = reviewedBy; return true; },
      requestMoreDocuments: async (rid, reviewedBy) => { if (w.raceLoss) return false; const r = w.renewals.find((x) => x.renewal_id === rid); if (!r || r.status !== 'under_review') return false; r.status = 'missing_documents'; r.reviewed_by = reviewedBy; return true; },
    },
    inquiry: {
      findById: async (iid) => w.inquiries.find((i) => i.inquiry_id === iid) || null,
      updateStatus: async (iid, status) => { w.inquiries.find((i) => i.inquiry_id === iid).status = status; },
      listReceivedByAgent: async (aid) => w.inquiries.filter((i) => i.agent_id === aid),
    },
    notification: { create: async (n) => { w.notifications.push(n); } },
    adminUser: { findByUserId: async (uid) => w.adminUsers[uid] || null },
    adminActionLog: { logAction: async (entry) => { w.actionLog.push(entry); } },
    recentlyViewed: { recordView: async () => {} },
    propertyReview: {},
    user: {
      findById: async (uid) => w.users[uid] || null,
      toSafeUser: (u) => (u ? { ...u } : null),
    },
    admin: {
      getDashboardStats: async () => ({ users: {}, properties: {}, agents: {}, renewals: {}, inquiries: {}, pendingProperties: [], pendingAgents: [], pendingRenewals: [], recentActions: [] }),
      listAllProperties: async () => ({ properties: Object.values(w.properties), pagination: { page: 1, limit: 20, total: Object.keys(w.properties).length, totalPages: 1 } }),
      listAllUsers: async () => ({ users: Object.values(w.users), pagination: { page: 1, limit: 20, total: Object.keys(w.users).length, totalPages: 1 } }),
      updateUserStatus: async (uid, status) => { w.users[uid].status = status; },
      listActionLog: async () => ({ logs: w.actionLog, pagination: { page: 1, limit: 30, total: w.actionLog.length, totalPages: 1 } }),
    },
  };
  return w;
}

/** Loads the REAL controllers with every model (and the DB pool) replaced by the world's stubs. */
function loadAgentControllers(world) {
  const stub = (rel, exports) => { const f = require.resolve(path.join(SRC, rel)); require.cache[f] = { id: f, filename: f, loaded: true, exports, children: [], paths: [] }; };
  Object.entries(world.models).forEach(([name, exports]) => stub(`models/${name}.model.js`, exports));
  // Only property.controller#createProperty uses the pool directly (a transaction wrapping
  // locationModel.findOrCreate + propertyModel.createProperty, both stubbed above to ignore the
  // executor and write straight to the world) — so the "connection" only needs these four methods.
  const fakeConnection = { query: async () => [{ insertId: 0 }], beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {} };
  stub('config/db.js', { pool: { getConnection: async () => fakeConnection, query: async () => [[]] } });
  const load = (name) => { const f = require.resolve(path.join(SRC, 'controllers', `${name}.controller.js`)); delete require.cache[f]; return require(f); };
  return { property: load('property'), verification: load('verification'), renewal: load('licenseRenewal'), agent: load('agent'), inquiry: load('inquiry'), admin: load('admin') };
}

function call(handler, { user, params = {}, body = {}, query = {}, file, files } = {}) {
  return new Promise((resolve, reject) => {
    const res = {
      code: 200,
      status(c) { this.code = c; return this; },
      json(b) { resolve({ status: this.code, body: b }); return this; },
      // Used by verification.controller#getDocumentFile — tests only exercise the
      // authorization/ownership short-circuits, not real static-file streaming.
      sendFile(p, cb) { resolve({ status: this.code, body: { file: p } }); if (cb) cb(); return this; },
    };
    const next = (err) => (err ? reject(err) : resolve({ status: 'next', body: null }));
    handler({ user, params, body, query, file, files, headers: {} }, res, next);
  });
}
const asUser = (w, uid) => ({ userId: uid, role: w.users[uid].role });

module.exports = { makeAgentWorld, loadAgentControllers, call, asUser };
