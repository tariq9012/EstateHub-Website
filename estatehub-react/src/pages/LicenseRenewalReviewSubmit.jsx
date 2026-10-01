// src/pages/LicenseRenewalReviewSubmit.jsx — renewal step 3: review and submit.
//   PUT /license-renewals/:id/submit  (only from draft / documents pending / missing documents; server-enforced)

import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import AgentLayout from '../components/agent/AgentLayout';
import LicenseSummary from '../components/agent/LicenseSummary';
import RenewalStepper from '../components/agent/RenewalStepper';
import useRenewalData from '../components/agent/useRenewalData';
import { Card, DataState, Icon, StatusBadge, btnOutline, btnPrimary } from '../components/agent/agentUi';
import { DOCUMENT_STATUS, DOCUMENT_TYPE_LABELS, RENEWAL_AGENT_EDITABLE, formatTimestamp } from '../components/agent/agentUtils';
import { submitRenewal } from '../api/licenseRenewals';

export default function LicenseRenewalReviewSubmit() {
  const navigate = useNavigate();
  const data = useRenewalData();
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const renewal = data.current;

  if (!data.loading && !data.error && !renewal) return <Navigate to="/submit-license-renewal" replace />;

  const documents = renewal?.documents || [];
  const editable = renewal && RENEWAL_AGENT_EDITABLE.includes(renewal.status);
  const hasRejected = documents.some((d) => d.status === 'rejected');
  const ready = editable && documents.length > 0 && !hasRejected;

  const submit = async () => {
    if (submitting || !ready || !confirmed) return;
    setSubmitting(true);
    setError('');
    try {
      const wasMissing = renewal.status === 'missing_documents';
      await submitRenewal(renewal.renewal_id);
      navigate(wasMissing ? `/resubmission-success?renewal=${renewal.renewal_id}` : '/submission-success', { state: { kind: 'renewal', renewalId: renewal.renewal_id } });
    } catch (err) {
      setError(err.message || 'Could not submit your renewal.');
      data.reloadSilent();
      setSubmitting(false);
    }
  };

  return (
    <AgentLayout active="renewal" title="Review & submit" subtitle="Check everything before sending it to the review team.">
      <RenewalStepper step={3} />
      <DataState loading={data.loading} error={data.error} onRetry={data.reload} rows={3}>
        {renewal && data.license && (
          <div className="max-w-3xl mx-auto space-y-6">
            <LicenseSummary license={data.license} />
            <Card className="p-6" data-widget="renewal-review-docs">
              <h2 className="text-headline-md font-headline-md text-primary mb-4">Documents ({documents.length})</h2>
              {documents.length === 0 ? (
                <p className="text-body-sm font-body-sm text-on-surface-variant">No documents uploaded. <Link to={`/license-renewal-document-upload?renewal=${renewal.renewal_id}`} className="text-primary underline">Add some</Link>.</p>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {documents.map((d) => (
                    <li key={d.document_id} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-label-md font-label-md text-primary">{DOCUMENT_TYPE_LABELS[d.document_type] || d.document_type}</p>
                        <p className="text-label-sm font-label-sm text-on-surface-variant">Uploaded {formatTimestamp(d.uploaded_at)}</p>
                      </div>
                      <StatusBadge meta={DOCUMENT_STATUS[d.status]} fallback={d.status} />
                    </li>
                  ))}
                </ul>
              )}
              {hasRejected && <p className="mt-3 text-body-sm font-body-sm text-error" role="alert">Some documents were rejected. Replace them first.</p>}
            </Card>

            {!editable ? (
              <Card className="p-6" role="note"><p className="text-body-md font-body-md text-primary">This renewal has already been submitted.</p><Link to={`/renewal-status-tracker?renewal=${renewal.renewal_id}`} className={`${btnPrimary} mt-4`}>Track status</Link></Card>
            ) : (
              <>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" className="mt-1 w-5 h-5 rounded border-border-subtle text-primary focus:ring-primary" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                  <span className="text-body-sm font-body-sm text-on-surface-variant">I confirm these documents are accurate and belong to me.</span>
                </label>
                {error && <p className="text-body-sm font-body-sm text-error" role="alert">{error}</p>}
                <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-3">
                  <Link to={`/license-renewal-document-upload?renewal=${renewal.renewal_id}`} className={btnOutline}>Back</Link>
                  <button type="button" className={btnPrimary} disabled={!ready || !confirmed || submitting} onClick={submit}>
                    {submitting ? 'Submitting…' : renewal.status === 'missing_documents' ? 'Resubmit renewal' : 'Submit renewal'}
                    <Icon name="check_circle" className="text-[20px]" />
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </DataState>
    </AgentLayout>
  );
}
