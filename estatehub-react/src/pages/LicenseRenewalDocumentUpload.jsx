// src/pages/LicenseRenewalDocumentUpload.jsx — renewal step 2: upload renewal documents.
//   GET /license-renewals/me · POST /license-renewals/:id/documents · DELETE /license-renewals/:id/documents/:documentId
// The renewal comes from ?renewal=ID and must belong to the signed-in agent (the API answers 404 otherwise).

import { Link, Navigate, useNavigate } from 'react-router-dom';
import AgentLayout from '../components/agent/AgentLayout';
import DocumentUploader from '../components/agent/DocumentUploader';
import RenewalStepper from '../components/agent/RenewalStepper';
import useRenewalData from '../components/agent/useRenewalData';
import { Card, DataState, StatusBadge, btnOutline, btnPrimary, useToast } from '../components/agent/agentUi';
import { RENEWAL_AGENT_EDITABLE, RENEWAL_STATUS } from '../components/agent/agentUtils';
import { deleteRenewalDocument, uploadRenewalDocument } from '../api/licenseRenewals';

const TYPES = ['license', 'id_proof', 'insurance', 'certification', 'other'];

export default function LicenseRenewalDocumentUpload() {
  const navigate = useNavigate();
  const data = useRenewalData();
  const { toast, show } = useToast();
  const renewal = data.current;

  if (!data.loading && !data.error && !renewal) return <Navigate to="/submit-license-renewal" replace />;

  const editable = renewal && RENEWAL_AGENT_EDITABLE.includes(renewal.status);
  const documents = renewal?.documents || [];
  const hasRejected = documents.some((d) => d.status === 'rejected');
  const canContinue = editable && documents.length > 0 && !hasRejected;

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

  return (
    <AgentLayout active="renewal" title="Upload renewal documents" subtitle="Add a clear copy of your renewed license and any supporting documents.">
      <RenewalStepper step={2} />
      <DataState loading={data.loading} error={data.error} onRetry={data.reload} rows={3}>
        {renewal && (
          <div className="max-w-3xl mx-auto space-y-6">
            <Card className="p-6" data-widget="renewal-documents">
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <h2 className="text-headline-md font-headline-md text-primary">Documents</h2>
                <StatusBadge meta={RENEWAL_STATUS[renewal.status]} fallback={renewal.status} />
              </div>
              <DocumentUploader
                documents={documents}
                types={TYPES}
                defaultType="license"
                canUpload={editable}
                lockedMessage="This renewal has been submitted, so documents can no longer be changed."
                onUpload={handleUpload}
                onDelete={handleDelete}
                canDelete={(d) => editable && d.status !== 'verified'}
                emptyText="No documents uploaded yet. Add at least one to continue."
              />
              {hasRejected && <p className="mt-4 text-body-sm font-body-sm text-error" role="alert">Remove or replace the rejected documents before continuing.</p>}
            </Card>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-3">
              <Link to="/submit-license-renewal" className={btnOutline}>Back</Link>
              <button type="button" className={btnPrimary} disabled={!canContinue} onClick={() => navigate(`/license-renewal-review-submit?renewal=${renewal.renewal_id}`)}>
                Continue to review
              </button>
            </div>
          </div>
        )}
      </DataState>
      {toast}
    </AgentLayout>
  );
}
