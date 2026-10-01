// src/components/agent/LicenseSummary.jsx
// Real license facts (from GET /verification/me): number, agency, expiry + live countdown, verification status.

import { Card, StatusBadge } from './agentUi';
import { VERIFICATION_STATUS, formatDate, licenseCountdown } from './agentUtils';

const COUNTDOWN_TEXT = {
  expired: (d) => `Expired ${Math.abs(d)} day${Math.abs(d) === 1 ? '' : 's'} ago`,
  expiring: (d) => `Expires in ${d} day${d === 1 ? '' : 's'}`,
  valid: (d) => `${d} days remaining`,
};

export default function LicenseSummary({ license, className = '' }) {
  const countdown = licenseCountdown(license.licenseExpiryDate);
  const tone = countdown.state === 'expired' ? 'text-error' : countdown.state === 'expiring' ? 'text-on-secondary-container' : 'text-primary';
  return (
    <Card className={`p-6 ${className}`} data-widget="license-summary">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div><dt className="text-label-sm font-label-sm text-on-surface-variant">License number</dt><dd className="text-body-md font-body-md text-primary break-all">{license.licenseNumber || '—'}</dd></div>
        <div><dt className="text-label-sm font-label-sm text-on-surface-variant">Agency</dt><dd className="text-body-md font-body-md text-primary">{license.agencyName || '—'}</dd></div>
        <div>
          <dt className="text-label-sm font-label-sm text-on-surface-variant">Current expiry date</dt>
          <dd className="text-body-md font-body-md text-primary">{license.licenseExpiryDate ? formatDate(license.licenseExpiryDate) : 'Not set'}</dd>
          {countdown.state !== 'unknown' && <dd className={`text-label-sm font-label-sm mt-0.5 ${tone}`}>{COUNTDOWN_TEXT[countdown.state](countdown.days)}</dd>}
        </div>
        <div><dt className="text-label-sm font-label-sm text-on-surface-variant mb-1">Verification</dt><dd><StatusBadge meta={VERIFICATION_STATUS[license.verificationStatus]} fallback={license.verificationStatus} /></dd></div>
      </dl>
    </Card>
  );
}
