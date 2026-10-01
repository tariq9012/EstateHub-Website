// src/pages/SubmitLicenseRenewal.jsx — renewal step 1: review the license on file and start (or resume) a renewal.
//   GET /verification/me · GET /license-renewals/me · POST /license-renewals
// Only one renewal can be open at a time; the server answers 409 with the open renewal's id if you try to start another.

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AgentLayout from '../components/agent/AgentLayout';
import LicenseSummary from '../components/agent/LicenseSummary';
import RenewalStepper from '../components/agent/RenewalStepper';
import useRenewalData from '../components/agent/useRenewalData';
import { Card, DataState, StatusBadge, btnOutline, btnPrimary } from '../components/agent/agentUi';
import { RENEWAL_AGENT_EDITABLE, RENEWAL_OPEN, RENEWAL_STATUS, licenseCountdown } from '../components/agent/agentUtils';
import { createRenewal } from '../api/licenseRenewals';

export default function SubmitLicenseRenewal() {
  const navigate = useNavigate();
  const data = useRenewalData();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  const open = data.list.find((r) => RENEWAL_OPEN.includes(r.status));
  const hasExpiry = Boolean(data.license?.licenseExpiryDate);
  const countdown = licenseCountdown(data.license?.licenseExpiryDate);

  const start = async () => {
    if (starting) return;
    setStarting(true);
    setError('');
    try {
      const res = await createRenewal();
      navigate(`/license-renewal-document-upload?renewal=${res.renewal.renewal_id}`);
    } catch (err) {
      if (err.status === 409 && err.details?.renewalId) navigate(`/license-renewal-document-upload?renewal=${err.details.renewalId}`);
      else {
        setError(err.message || 'Could not start your renewal.');
        setStarting(false);
      }
    }
  };

  return (
    <AgentLayout active="renewal" title="Renew your license" subtitle="Keep your credentials current so your profile stays verified.">
      <RenewalStepper step={1} />
      <DataState loading={data.loading} error={data.error} onRetry={data.reload} rows={3}>
        {data.license && (
          <div className="space-y-6 max-w-3xl mx-auto">
            <LicenseSummary license={data.license} />

            {!hasExpiry && (
              <Card className="p-6" role="alert">
                <p className="text-label-md font-label-md text-primary mb-1">We don’t have your license expiry date yet</p>
                <p className="text-body-sm font-body-sm text-on-surface-variant mb-4">Add it on the Verification page, then come back to start your renewal.</p>
                <Link to="/agent-verification" className={btnPrimary}>Go to Verification</Link>
              </Card>
            )}

            {hasExpiry && countdown.state === 'valid' && !open && (
              <p className="text-body-sm font-body-sm text-on-surface-variant">Your license is valid for {countdown.days} more days. You can renew early if you like.</p>
            )}

            {hasExpiry && open && (
              <Card className="p-6" data-widget="open-renewal">
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <h2 className="text-headline-md font-headline-md text-primary">Renewal in progress</h2>
                  <StatusBadge meta={RENEWAL_STATUS[open.status]} fallback={open.status} />
                </div>
                {RENEWAL_AGENT_EDITABLE.includes(open.status) ? (
                  <>
                    <p className="text-body-sm font-body-sm text-on-surface-variant mb-4">You already started a renewal. Pick up where you left off.</p>
                    <Link to={open.status === 'missing_documents' ? `/resolve-missing-documents?renewal=${open.renewal_id}` : `/license-renewal-document-upload?renewal=${open.renewal_id}`} className={btnPrimary}>
                      {open.status === 'missing_documents' ? 'Resolve missing documents' : 'Continue renewal'}
                    </Link>
                  </>
                ) : (
                  <>
                    <p className="text-body-sm font-body-sm text-on-surface-variant mb-4">Your renewal has been submitted and is being reviewed.</p>
                    <Link to={`/renewal-status-tracker?renewal=${open.renewal_id}`} className={btnPrimary}>Track status</Link>
                  </>
                )}
              </Card>
            )}

            {hasExpiry && !open && (
              <Card className="p-6" data-widget="start-renewal">
                <h2 className="text-headline-md font-headline-md text-primary mb-2">Start a renewal</h2>
                <p className="text-body-sm font-body-sm text-on-surface-variant mb-4">
                  You’ll upload a copy of your renewed license (and any supporting documents) and send it for review. Your expiry date is updated once the renewal is approved.
                </p>
                {error && <p className="mb-3 text-body-sm font-body-sm text-error" role="alert">{error}</p>}
                <div className="flex flex-wrap gap-3">
                  <button type="button" className={btnPrimary} onClick={start} disabled={starting}>{starting ? 'Starting…' : 'Start renewal'}</button>
                  <Link to="/agent-certification-tracking" className={btnOutline}>Cancel</Link>
                </div>
              </Card>
            )}
          </div>
        )}
      </DataState>
    </AgentLayout>
  );
}
