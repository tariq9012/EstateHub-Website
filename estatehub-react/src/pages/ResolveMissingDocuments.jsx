// src/pages/ResolveMissingDocuments.jsx — action page for a renewal in 'missing_documents' status.
//   GET /license-renewals/me · POST/DELETE .../documents · PUT /license-renewals/:id/submit

import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import AgentLayout from '../components/agent/AgentLayout';
import DocumentUploader from '../components/agent/DocumentUploader';
import useRenewalData, { renewalReference } from '../components/agent/useRenewalData';
import { Card, DataState, Icon, StatusBadge, btnOutline, btnPrimary, useToast } from '../components/agent/agentUi';
import { RENEWAL_STATUS } from '../components/agent/agentUtils';
import { deleteRenewalDocument, submitRenewal, uploadRenewalDocument } from '../api/licenseRenewals';

const TYPES = ['license', 'id_proof', 'insurance', 'certification', 'other'];

export default function ResolveMissingDocuments() {
  const navigate = useNavigate();
  const data = useRenewalData();
  const { toast, show } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const renewal = data.current;

  if (!data.loading && !data.error && renewal && renewal.status !== 'missing_documents') {
    return <Navigate to={`/renewal-status-tracker?renewal=${renewal.renewal_id}`} replace />;
  }
  if (!data.loading && !data.error && !renewal) return <Navigate to="/agent-certification-tracking" replace />;

  const documents = renewal?.documents || [];
  const hasRejected = documents.some((d) => d.status === 'rejected');
  const ready = documents.length > 0 && !hasRejected;

  const handleUpload = async (formData) => {
    await uploadRenewalDocument(renewal.renewal_id, formData);
    await data.reloadSilent();
    show('success', 'Document uploaded.');
  };
  const handleDelete = async (doc) => {
    await deleteRenewalDocument(renewal.renewal_id, doc.document_id);
    await data.reloadSilent();
    show('success', 'Document removed.');
  };

  const resubmit = async () => {
    if (submitting || !ready) return;
    setSubmitting(true);
    try {
      await submitRenewal(renewal.renewal_id);
      navigate(`/resubmission-success?renewal=${renewal.renewal_id}`);
    } catch (err) {
      show('error', err.message || 'Could not resubmit your renewal.');
      data.reloadSilent();
      setSubmitting(false);
    }
  };

  return (
    <AgentLayout active="renewal" title="Resolve missing documents" subtitle="The compliance team needs more from you before this renewal can proceed.">
      <DataState loading={data.loading} error={data.error} onRetry={data.reload} rows={3}>
        {renewal && (
          <div className="max-w-3xl mx-auto space-y-6">
            <Card className="p-6" role="alert" data-widget="missing-notice">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-full bg-error-container flex items-center justify-center text-on-error-container flex-shrink-0"><Icon name="error" /></div>
                <div>
                  <div className="flex flex-wrap items-center gap-3 mb-1">
                    <h2 className="text-headline-md font-headline-md text-primary">Action required</h2>
                    <StatusBadge meta={RENEWAL_STATUS[renewal.status]} fallback={renewal.status} />
                  </div>
                  <p className="text-body-sm font-body-sm text-on-surface-variant">Reference {renewalReference(renewal)}. Replace any rejected documents below, add anything missing, then resubmit.</p>
                </div>
              </div>
            </Card>

            <Card className="p-6" data-widget="documents">
              <h2 className="text-headline-md font-headline-md text-primary mb-4">Documents</h2>
              <DocumentUploader
                documents={documents}
                types={TYPES}
                defaultType="license"
                canUpload
                onUpload={handleUpload}
                onDelete={handleDelete}
                canDelete={(d) => d.status !== 'verified'}
                emptyText="No documents uploaded yet."
              />
            </Card>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-3">
              <Link to="/agent-certification-tracking" className={btnOutline}>Back</Link>
              <button type="button" className={btnPrimary} disabled={!ready || submitting} onClick={resubmit}>
                {submitting ? 'Resubmitting…' : 'Resubmit renewal'}
              </button>
            </div>
          </div>
        )}
      </DataState>
      {toast}
    </AgentLayout>
  );
}
