// src/pages/AgentCertificationTracking.jsx — compliance hub: verification + license + renewal history.
//   GET /verification/me · GET /license-renewals/me

import { Link } from 'react-router-dom';
import AgentLayout from '../components/agent/AgentLayout';
import LicenseSummary from '../components/agent/LicenseSummary';
import useRenewalData, { renewalReference } from '../components/agent/useRenewalData';
import { Card, DataState, Icon, StatusBadge, btnOutline, btnPrimary } from '../components/agent/agentUi';
import { RENEWAL_AGENT_EDITABLE, RENEWAL_OPEN, RENEWAL_STATUS, VERIFICATION_STATUS, formatDate, formatTimestamp, licenseCountdown } from '../components/agent/agentUtils';

function renewalLink(renewal) {
  if (RENEWAL_AGENT_EDITABLE.includes(renewal.status)) {
    return renewal.status === 'missing_documents' ? `/resolve-missing-documents?renewal=${renewal.renewal_id}` : `/license-renewal-document-upload?renewal=${renewal.renewal_id}`;
  }
  return `/renewal-status-tracker?renewal=${renewal.renewal_id}`;
}

export default function AgentCertificationTracking() {
  const data = useRenewalData();
  const license = data.license;
  const open = data.list.find((r) => RENEWAL_OPEN.includes(r.status));
  const countdown = license ? licenseCountdown(license.licenseExpiryDate) : { state: 'unknown' };

  return (
    <AgentLayout active="renewal" title="Verification & License" subtitle="Your compliance status, license expiry and renewal history." actions={<Link to="/agent-verification" className={btnOutline}><Icon name="verified_user" className="text-[18px]" />Verification documents</Link>}>
      <DataState loading={data.loading} error={data.error} onRetry={data.reload} rows={4}>
        {license && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="p-6" data-widget="verification-summary">
                <p className="text-label-md font-label-md text-on-surface-variant mb-2">Verification</p>
                <div className="flex items-center gap-3 mb-1"><StatusBadge meta={VERIFICATION_STATUS[license.verificationStatus]} fallback={license.verificationStatus} /></div>
                <p className="text-body-sm font-body-sm text-on-surface-variant">
                  {license.verificationStatus === 'verified' ? 'Your credentials are verified.' : license.verificationStatus === 'pending' ? 'Your submission is being reviewed.' : license.verificationStatus === 'rejected' ? 'Review the feedback and resubmit.' : 'Submit your documents to get verified.'}
                </p>
                <Link to="/agent-verification" className="mt-3 inline-block text-label-md font-label-md text-primary hover:underline">Manage verification</Link>
              </Card>
              <Card className="p-6" data-widget="license-expiry-summary">
                <p className="text-label-md font-label-md text-on-surface-variant mb-2">License expiry</p>
                <p className="text-headline-md font-headline-md text-primary">{license.licenseExpiryDate ? formatDate(license.licenseExpiryDate) : 'Not set'}</p>
                {countdown.state !== 'unknown' && (
                  <p className={`text-body-sm font-body-sm ${countdown.state === 'expired' ? 'text-error' : 'text-on-surface-variant'}`}>
                    {countdown.state === 'expired' ? `Expired ${Math.abs(countdown.days)} day${Math.abs(countdown.days) === 1 ? '' : 's'} ago` : `${countdown.days} days remaining`}
                  </p>
                )}
              </Card>
            </div>

            <LicenseSummary license={license} />

            <Card className="p-6" data-widget="renewal-cta">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h2 className="text-headline-md font-headline-md text-primary">License renewal</h2>
                  <p className="text-body-sm font-body-sm text-on-surface-variant mt-1">
                    {open ? 'You have a renewal in progress.' : 'Start a renewal when your license is due, or any time you like.'}
                  </p>
                </div>
                <Link to={open ? renewalLink(open) : '/submit-license-renewal'} className={btnPrimary}>
                  {open ? 'Continue renewal' : 'Start a renewal'}
                </Link>
              </div>
            </Card>

            <Card className="p-6" data-widget="renewal-history">
              <h2 className="text-headline-md font-headline-md text-primary mb-4">Renewal history</h2>
              {data.list.length === 0 ? (
                <p className="text-body-sm font-body-sm text-on-surface-variant py-2">No renewals yet.</p>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {data.list.map((r) => (
                    <li key={r.renewal_id}>
                      <Link to={renewalLink(r)} className="py-4 flex items-center justify-between gap-3 hover:bg-surface-container-low rounded-lg -mx-2 px-2 transition-colors">
                        <div>
                          <p className="text-label-md font-label-md text-primary">{renewalReference(r)}</p>
                          <p className="text-label-sm font-label-sm text-on-surface-variant">Started {formatTimestamp(r.created_at)}</p>
                        </div>
                        <StatusBadge meta={RENEWAL_STATUS[r.status]} fallback={r.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}
      </DataState>
    </AgentLayout>
  );
}
