// src/pages/AdminReviewQueue.jsx
// License Renewal admin review: submitted -> under_review -> approved/rejected/missing_documents,
// enforced server-side (see licenseRenewal.model.js). Each renewal's documents can be reviewed
// individually via the same verification_documents endpoints used for initial agent verification.

import { useState } from 'react';
import AdminLayout from '../components/admin/AdminLayout';
import useAsyncData from '../hooks/useAsyncData';
import {
  getAllRenewals, moveRenewalToUnderReview, approveRenewal, rejectRenewal, requestMoreRenewalDocuments,
} from '../api/licenseRenewals';
import { verifyDocument, rejectDocument } from '../api/verification';
import DocumentPreviewModal from '../components/admin/DocumentPreviewModal';
import DocumentRejectionReasonsModal from '../components/admin/DocumentRejectionReasonsModal';
import { Card, DataState, StatusBadge, Icon, btnPrimary, btnOutline, inputClass, useToast, EmptyBox } from '../components/agent/agentUi';
import { fullName, formatDate, formatTimestamp, RENEWAL_STATUS, DOCUMENT_STATUS, DOCUMENT_TYPE_LABELS } from '../components/agent/agentUtils';

const STATUS_TABS = ['submitted', 'under_review', 'missing_documents', 'approved', 'rejected'];

export default function AdminReviewQueue() {
  const [status, setStatus] = useState('submitted');
  const { data, loading, error, reload } = useAsyncData(() => getAllRenewals(status), [status]);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [rejectingDoc, setRejectingDoc] = useState(null);
  const [rejectingRenewal, setRejectingRenewal] = useState(null);
  const [expiryDrafts, setExpiryDrafts] = useState({}); // renewal_id -> newExpiryDate input value
  const [busy, setBusy] = useState(null);
  const { toast, show } = useToast();

  const renewals = data?.renewals || [];

  const act = async (fn, key, successMsg) => {
    setBusy(key);
    try {
      await fn();
      show('success', successMsg);
      reload({ silent: true });
      return true;
    } catch (err) {
      show('error', err.message || 'That action could not be completed.');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const doVerifyDoc = (documentId) => act(() => verifyDocument(documentId), documentId, 'Document verified.');
  const doRejectDoc = async (reason) => {
    const ok = await act(() => rejectDocument(rejectingDoc, reason), rejectingDoc, 'Document rejected.');
    if (ok) setRejectingDoc(null);
  };
  const doStartReview = (renewalId) => act(() => moveRenewalToUnderReview(renewalId), renewalId, 'Moved to under review.');
  const doRequestDocs = (renewalId) => act(() => requestMoreRenewalDocuments(renewalId), renewalId, 'Requested more documents from the agent.');
  const doReject = async (reason) => {
    const ok = await act(() => rejectRenewal(rejectingRenewal, reason), rejectingRenewal, 'Renewal rejected.');
    if (ok) setRejectingRenewal(null);
  };
  const doApprove = (renewalId) => {
    const newExpiryDate = expiryDrafts[renewalId];
    if (!newExpiryDate) { show('error', 'Enter the new license expiry date before approving.'); return; }
    act(() => approveRenewal(renewalId, newExpiryDate), renewalId, 'Renewal approved — license expiry updated.');
  };

  return (
    <AdminLayout active="renewals" title="License Renewals" subtitle="Review submitted renewal documents and decide each renewal." wide>
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={`whitespace-nowrap px-4 py-2 rounded-full text-label-md font-label-md transition-colors ${
              status === s ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            {RENEWAL_STATUS[s]?.label || s}
          </button>
        ))}
      </div>

      <DataState
        loading={loading}
        error={error}
        onRetry={reload}
        empty={!loading && !error && renewals.length === 0}
        emptyProps={{ icon: 'badge', title: `No renewals with status "${RENEWAL_STATUS[status]?.label || status}"` }}
      >
        <div className="space-y-5">
          {renewals.map((r) => {
            const documents = r.documents || [];
            const renewalBusy = busy === r.renewal_id;
            return (
              <Card key={r.renewal_id} className="p-5">
                <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-label-md font-label-md text-primary">{fullName(r.first_name, r.last_name)}</span>
                      <StatusBadge meta={RENEWAL_STATUS[r.status]} fallback={r.status} />
                    </div>
                    <p className="text-body-sm font-body-sm text-on-surface-variant mt-1">
                      License {r.license_number} · Current expiry {formatDate(r.current_license_expiry)} · Submitted {formatTimestamp(r.submitted_at)}
                    </p>
                  </div>

                  {r.status === 'submitted' && (
                    <button type="button" className={btnPrimary} disabled={renewalBusy} onClick={() => doStartReview(r.renewal_id)}>
                      <Icon name="rate_review" className="text-[18px]" /> Start review
                    </button>
                  )}

                  {r.status === 'under_review' && (
                    <div className="flex items-center gap-3 flex-wrap">
                      <button type="button" className="text-error text-label-md font-label-md hover:underline disabled:opacity-50" disabled={renewalBusy} onClick={() => setRejectingRenewal(r.renewal_id)}>
                        Reject
                      </button>
                      <button type="button" className={btnOutline} disabled={renewalBusy} onClick={() => doRequestDocs(r.renewal_id)}>
                        Request more documents
                      </button>
                      <input
                        type="date"
                        className={`${inputClass} w-auto`}
                        value={expiryDrafts[r.renewal_id] || ''}
                        onChange={(e) => setExpiryDrafts((d) => ({ ...d, [r.renewal_id]: e.target.value }))}
                        aria-label="New license expiry date"
                      />
                      <button type="button" className={btnPrimary} disabled={renewalBusy} onClick={() => doApprove(r.renewal_id)}>
                        <Icon name="check" className="text-[18px]" /> Approve
                      </button>
                    </div>
                  )}
                </div>

                {documents.length === 0 ? (
                  <EmptyBox icon="description" title="No documents submitted" compact />
                ) : (
                  <div className="divide-y divide-border-subtle border border-border-subtle rounded-xl overflow-hidden">
                    {documents.map((d) => (
                      <div key={d.document_id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-label-md font-label-md text-primary">{DOCUMENT_TYPE_LABELS[d.document_type] || d.document_type}</span>
                            <StatusBadge meta={DOCUMENT_STATUS[d.status]} fallback={d.status} />
                          </div>
                          {d.status === 'rejected' && d.rejection_reason && (
                            <p className="text-body-sm font-body-sm text-error mt-1">Reason: {d.rejection_reason}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <button type="button" className={btnOutline} onClick={() => setPreviewDoc(d)}>
                            <Icon name="visibility" className="text-[18px]" /> View
                          </button>
                          {d.status === 'pending' && (
                            <>
                              <button type="button" className="text-error text-label-md font-label-md hover:underline disabled:opacity-50" disabled={busy === d.document_id} onClick={() => setRejectingDoc(d.document_id)}>
                                Reject
                              </button>
                              <button type="button" className={btnPrimary} disabled={busy === d.document_id} onClick={() => doVerifyDoc(d.document_id)}>
                                <Icon name="check" className="text-[18px]" /> Verify
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </DataState>

      {previewDoc && (
        <DocumentPreviewModal documentId={previewDoc.document_id} documentType={previewDoc.document_type} onClose={() => setPreviewDoc(null)} />
      )}
      {rejectingDoc && (
        <DocumentRejectionReasonsModal
          title="Reject this document"
          description="This reason is shown to the agent so they can resubmit."
          submitting={busy === rejectingDoc}
          onCancel={() => setRejectingDoc(null)}
          onConfirm={doRejectDoc}
        />
      )}
      {rejectingRenewal && (
        <DocumentRejectionReasonsModal
          title="Reject this renewal"
          description="This ends the renewal — the agent can start a new one."
          submitting={busy === rejectingRenewal}
          onCancel={() => setRejectingRenewal(null)}
          onConfirm={doReject}
        />
      )}
      {toast}
    </AdminLayout>
  );
}
