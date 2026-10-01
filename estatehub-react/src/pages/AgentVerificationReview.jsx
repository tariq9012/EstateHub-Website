// src/pages/AgentVerificationReview.jsx
// Single-agent verification review: agent profile, submitted documents (view/verify/reject each),
// and the overall verify/reject-agent decision. Reads ?agentId= from the query string.

import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import AdminLayout from '../components/admin/AdminLayout';
import useAsyncData from '../hooks/useAsyncData';
import {
  getAgentVerificationDetail, verifyDocument, rejectDocument, verifyAgent, rejectAgent,
} from '../api/verification';
import DocumentPreviewModal from '../components/admin/DocumentPreviewModal';
import DocumentRejectionReasonsModal from '../components/admin/DocumentRejectionReasonsModal';
import { Card, DataState, StatusBadge, Icon, btnPrimary, btnOutline, useToast, EmptyBox } from '../components/agent/agentUi';
import { fullName, formatDate, formatTimestamp, VERIFICATION_STATUS, DOCUMENT_STATUS, DOCUMENT_TYPE_LABELS } from '../components/agent/agentUtils';

export default function AgentVerificationReview() {
  const [params] = useSearchParams();
  const agentId = params.get('agentId');
  const { data, loading, error, reload } = useAsyncData(() => getAgentVerificationDetail(agentId), [agentId]);
  const [previewDoc, setPreviewDoc] = useState(null); // { document_id, document_type }
  const [rejectingDoc, setRejectingDoc] = useState(null); // document_id
  const [busy, setBusy] = useState(null); // a document_id, 'agent', or null
  const { toast, show } = useToast();

  const agent = data?.agent;
  const documents = data?.documents || [];
  const hasPendingDocs = documents.some((d) => d.status === 'pending');

  const doVerifyDoc = async (documentId) => {
    setBusy(documentId);
    try {
      await verifyDocument(documentId);
      show('success', 'Document verified.');
      reload({ silent: true });
    } catch (err) {
      show('error', err.message || 'Could not verify this document.');
    } finally {
      setBusy(null);
    }
  };

  const doRejectDoc = async (reason) => {
    setBusy(rejectingDoc);
    try {
      await rejectDocument(rejectingDoc, reason);
      show('success', 'Document rejected.');
      setRejectingDoc(null);
      reload({ silent: true });
    } catch (err) {
      show('error', err.message || 'Could not reject this document.');
    } finally {
      setBusy(null);
    }
  };

  const doVerifyAgent = async () => {
    setBusy('agent');
    try {
      await verifyAgent(agentId);
      show('success', `${fullName(agent.first_name, agent.last_name)} is now a verified agent.`);
      reload({ silent: true });
    } catch (err) {
      show('error', err.message || 'Could not verify this agent.');
    } finally {
      setBusy(null);
    }
  };

  // Note: unlike a document rejection, there is no rejection_reason column on agents in the
  // schema — the agent's feedback comes from the per-document reasons above. So this is a plain
  // confirmation rather than the reason-required modal used for documents/listings.
  const doRejectAgent = async () => {
    if (!window.confirm('Reject this agent\'s verification? They will need to resubmit.')) return;
    setBusy('agent');
    try {
      await rejectAgent(agentId);
      show('success', 'Verification rejected.');
      reload({ silent: true });
    } catch (err) {
      show('error', err.message || 'Could not reject this verification.');
    } finally {
      setBusy(null);
    }
  };

  if (!agentId) {
    return (
      <AdminLayout active="verification" title="Agent Verification">
        <EmptyBox icon="error" title="No agent selected">
          <Link to="/agent-verification-queue" className="text-primary hover:underline">Back to the queue</Link>
        </EmptyBox>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      active="verification"
      title={agent ? fullName(agent.first_name, agent.last_name) : 'Agent Verification'}
      subtitle={agent ? `${agent.email} · License ${agent.license_number || '—'}` : undefined}
      actions={<Link to="/agent-verification-queue" className={btnOutline}><Icon name="arrow_back" className="text-[18px]" /> Back to queue</Link>}
    >
      <DataState loading={loading} error={error} onRetry={reload} empty={!loading && !error && !agent} emptyProps={{ icon: 'person_off', title: 'Agent not found' }}>
        {agent && (
          <div className="space-y-8 pb-10">
            <Card className="p-5">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <StatusBadge meta={VERIFICATION_STATUS[agent.verification_status]} fallback={agent.verification_status} />
                  <p className="text-body-sm font-body-sm text-on-surface-variant mt-2">
                    License expiry: {formatDate(agent.license_expiry_date)} · Agency: {agent.agency_name || '—'}
                  </p>
                </div>
                {agent.verification_status === 'pending' && (
                  <div className="flex gap-3">
                    <button type="button" className="text-error text-label-md font-label-md hover:underline" disabled={busy === 'agent'} onClick={doRejectAgent}>
                      Reject verification
                    </button>
                    <button
                      type="button"
                      className={btnPrimary}
                      disabled={busy === 'agent' || hasPendingDocs}
                      title={hasPendingDocs ? 'Review every submitted document before verifying this agent' : undefined}
                      onClick={doVerifyAgent}
                    >
                      <Icon name="verified" className="text-[18px]" /> Verify agent
                    </button>
                  </div>
                )}
              </div>
              {agent.verification_status === 'pending' && hasPendingDocs && (
                <p className="text-label-sm font-label-sm text-on-surface-variant mt-3">
                  Review every document below before you can verify this agent.
                </p>
              )}
            </Card>

            <section>
              <h2 className="text-headline-md font-headline-md text-primary mb-4">Submitted documents</h2>
              {documents.length === 0 ? (
                <EmptyBox icon="description" title="No documents submitted yet" />
              ) : (
                <Card className="divide-y divide-border-subtle overflow-hidden">
                  {documents.map((d) => (
                    <div key={d.document_id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-label-md font-label-md text-primary">{DOCUMENT_TYPE_LABELS[d.document_type] || d.document_type}</span>
                          <StatusBadge meta={DOCUMENT_STATUS[d.status]} fallback={d.status} />
                        </div>
                        <p className="text-body-sm font-body-sm text-on-surface-variant mt-1">Uploaded {formatTimestamp(d.uploaded_at)}</p>
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
                </Card>
              )}
            </section>
          </div>
        )}
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
      {toast}
    </AdminLayout>
  );
}
