// src/pages/AgentVerification.jsx
// The agent's own verification:
//   GET  /verification/me               status, license info, own documents, canSubmit / missing
//   POST /verification/documents        upload (multipart)          DELETE /verification/documents/:id
//   PUT  /agents/me/profile             declare license expiry (locked once an admin verified the agent)
//   POST /verification/submit           submit for admin review
// The status is never set here: "verified" only ever comes from an admin's decision.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import AgentLayout from '../components/agent/AgentLayout';
import DocumentUploader from '../components/agent/DocumentUploader';
import useAsyncData from '../hooks/useAsyncData';
import { getMyVerification, uploadVerificationDocument, deleteVerificationDocument, submitMyVerification } from '../api/verification';
import { updateMyAgentProfile } from '../api/agents';
import { Card, DataState, Icon, StatusBadge, btnPrimary, inputClass, labelClass, useToast } from '../components/agent/agentUi';
import { VERIFICATION_STATUS, formatDate, formatTimestamp, licenseCountdown } from '../components/agent/agentUtils';

const TYPES = ['license', 'id_proof', 'insurance', 'certification', 'other'];

const STATUS_COPY = {
  unverified: { icon: 'shield', title: 'Not submitted yet', body: 'Add your license and expiry date, then submit your profile for review. Buyers see a “Verified” badge once you are approved.' },
  pending: { icon: 'hourglass_top', title: 'In review', body: 'Our team is reviewing your documents. You’ll be notified when there’s a decision. Documents under review are locked, except any that were rejected.' },
  verified: { icon: 'verified', title: 'You’re verified', body: 'Your credentials were approved. To update your license, use license renewal.' },
  rejected: { icon: 'gpp_bad', title: 'Not approved', body: 'Your verification wasn’t approved. Replace any rejected documents below and submit again.' },
};

function ExpiryForm({ data, onSaved }) {
  const [value, setValue] = useState(data.licenseExpiryDate ? String(data.licenseExpiryDate).slice(0, 10) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const editable = data.canEditLicenseExpiry;
  const countdown = licenseCountdown(data.licenseExpiryDate);

  const save = async () => {
    if (!value) {
      setError('Please choose your license expiry date.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await updateMyAgentProfile({ licenseExpiryDate: value });
      await onSaved('License expiry date saved.');
    } catch (err) {
      setError(err.message || 'Could not save the date.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
      <div>
        <p className={labelClass}>License number</p>
        <p className="px-4 py-3 rounded-lg bg-surface-container-low border border-border-subtle text-body-md font-body-md text-primary break-all">{data.licenseNumber || '—'}</p>
      </div>
      <div>
        <label htmlFor="license-expiry" className={labelClass}>License expiry date</label>
        <input id="license-expiry" type="date" className={inputClass} value={value} disabled={!editable || saving} onChange={(e) => { setValue(e.target.value); setError(''); }} />
      </div>
      <div className="flex items-center gap-3">
        {editable ? (
          <button type="button" className={btnPrimary} onClick={save} disabled={saving || !value || value === String(data.licenseExpiryDate || '').slice(0, 10)}>
            {saving ? 'Saving…' : 'Save date'}
          </button>
        ) : (
          <p className="text-label-sm font-label-sm text-on-surface-variant">Verified — changes go through <Link to="/agent-certification-tracking" className="text-primary underline">license renewal</Link>.</p>
        )}
      </div>
      {error && <p className="md:col-span-3 text-body-sm font-body-sm text-error" role="alert">{error}</p>}
      {countdown.state !== 'unknown' && (
        <p className="md:col-span-3 text-label-sm font-label-sm text-on-surface-variant">
          {countdown.state === 'expired' ? `Expired ${Math.abs(countdown.days)} day${Math.abs(countdown.days) === 1 ? '' : 's'} ago.` : `${countdown.days} day${countdown.days === 1 ? '' : 's'} until expiry.`}
        </p>
      )}
    </div>
  );
}

export default function AgentVerification() {
  const verification = useAsyncData(() => getMyVerification());
  const data = verification.data;
  const { toast, show } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  const status = data?.verificationStatus;
  const copy = STATUS_COPY[status] || STATUS_COPY.unverified;
  const documents = data?.documents || [];

  const reloadWith = async (message) => {
    await verification.reload({ silent: true });
    if (message) show('success', message);
  };

  const handleUpload = async (formData) => {
    await uploadVerificationDocument(formData);
    await reloadWith('Document uploaded.');
  };
  const handleDelete = async (doc) => {
    await deleteVerificationDocument(doc.document_id);
    await reloadWith('Document removed.');
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setConfirmSubmit(false);
    try {
      await submitMyVerification();
      await reloadWith('Submitted. Your verification is now in review.');
    } catch (err) {
      show('error', err.message || 'Could not submit your verification.');
      verification.reload({ silent: true });
    } finally {
      setSubmitting(false);
    }
  };

  // Mirrors the server rule; the server decides.
  const canDelete = (doc) => doc.status === 'rejected' || (doc.status === 'pending' && status !== 'pending' && status !== 'verified');
  const hasLicenseDoc = documents.some((d) => d.document_type === 'license' && d.status !== 'rejected');

  return (
    <AgentLayout active="verification" title="Verification" subtitle="Get verified so buyers can trust your profile.">
      <DataState loading={verification.loading} error={verification.error} onRetry={() => verification.reload()} rows={4}>
        {data && (
          <div className="space-y-6">
            <Card className="p-6" data-widget="verification-status">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-surface-container-low flex items-center justify-center text-primary flex-shrink-0"><Icon name={copy.icon} className="text-[28px]" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-headline-md font-headline-md text-primary">{copy.title}</h2>
                    <StatusBadge meta={VERIFICATION_STATUS[status]} fallback={status} />
                  </div>
                  <p className="mt-1 text-body-md font-body-md text-on-surface-variant">{copy.body}</p>
                  {status === 'verified' && data.verifiedAt && <p className="mt-1 text-label-sm font-label-sm text-on-surface-variant">Verified on {formatTimestamp(data.verifiedAt)}</p>}
                </div>
              </div>
            </Card>

            <Card className="p-6" data-widget="license-details">
              <h2 className="text-headline-md font-headline-md text-primary mb-4">License details</h2>
              <ExpiryForm key={String(data.licenseExpiryDate)} data={data} onSaved={reloadWith} />
            </Card>

            <Card className="p-6" data-widget="documents">
              <h2 className="text-headline-md font-headline-md text-primary mb-1">Verification documents</h2>
              <p className="text-body-sm font-body-sm text-on-surface-variant mb-5">Upload a clear copy of your real estate license (required). You can add ID, insurance or certifications too.</p>
              <DocumentUploader
                documents={documents}
                types={TYPES}
                defaultType="license"
                canUpload={data.canModifyDocuments}
                lockedMessage="Your account is verified, so documents can’t be changed here. Use license renewal to update your license."
                onUpload={handleUpload}
                onDelete={handleDelete}
                canDelete={canDelete}
                emptyText="You haven’t uploaded any documents yet."
              />
            </Card>

            {(status === 'unverified' || status === 'rejected') && (
              <Card className="p-6" data-widget="submit">
                <h2 className="text-headline-md font-headline-md text-primary mb-3">Submit for review</h2>
                <ul className="space-y-2 mb-5" aria-label="Requirements">
                  <li className="flex items-center gap-2 text-body-sm font-body-sm"><Icon name={hasLicenseDoc ? 'check_circle' : 'radio_button_unchecked'} className={hasLicenseDoc ? 'text-status-success' : 'text-on-surface-variant'} />A license document (not rejected)</li>
                  <li className="flex items-center gap-2 text-body-sm font-body-sm"><Icon name={data.licenseExpiryDate ? 'check_circle' : 'radio_button_unchecked'} className={data.licenseExpiryDate ? 'text-status-success' : 'text-on-surface-variant'} />License expiry date{data.licenseExpiryDate ? ` (${formatDate(data.licenseExpiryDate)})` : ''}</li>
                </ul>
                {confirmSubmit ? (
                  <div role="group" aria-label="Confirm submission" className="bg-surface-container-low border border-border-subtle rounded-lg p-4">
                    <p className="text-label-md font-label-md text-primary">Submit your verification now?</p>
                    <p className="text-body-sm font-body-sm text-on-surface-variant mt-1">Documents under review are locked until a decision is made.</p>
                    <div className="mt-3 flex flex-col sm:flex-row gap-2">
                      <button type="button" className="min-h-[44px] px-5 rounded-lg border border-border-subtle text-primary text-label-md font-label-md hover:bg-surface-container-low" onClick={() => setConfirmSubmit(false)}>Not yet</button>
                      <button type="button" className={btnPrimary} disabled={submitting} onClick={handleSubmit}>{submitting ? 'Submitting…' : 'Yes, submit'}</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className={btnPrimary} disabled={!data.canSubmit || submitting} onClick={() => setConfirmSubmit(true)}>
                    {status === 'rejected' ? 'Resubmit for review' : 'Submit for review'}
                  </button>
                )}
                {!data.canSubmit && data.missingForSubmission?.length > 0 && (
                  <p className="mt-3 text-body-sm font-body-sm text-on-surface-variant">Still needed: {data.missingForSubmission.join(' and ')}.</p>
                )}
              </Card>
            )}
          </div>
        )}
      </DataState>
      {toast}
    </AgentLayout>
  );
}
