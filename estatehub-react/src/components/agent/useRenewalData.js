// src/components/agent/useRenewalData.js
// Loads the agent's verification/license info and renewals for the renewal screens, and picks the
// "current" renewal: the one in ?renewal=ID, otherwise the one still in progress, otherwise the latest.

import { useSearchParams } from 'react-router-dom';
import useAsyncData from '../../hooks/useAsyncData';
import { getMyVerification } from '../../api/verification';
import { getMyRenewals } from '../../api/licenseRenewals';
import { RENEWAL_OPEN } from './agentUtils';

export function pickRenewal(renewals, requestedId) {
  if (requestedId) return renewals.find((r) => r.renewal_id === requestedId) || null;
  return renewals.find((r) => RENEWAL_OPEN.includes(r.status)) || renewals[0] || null;
}

export default function useRenewalData() {
  const [params] = useSearchParams();
  const requestedId = Number(params.get('renewal')) || null;
  const verification = useAsyncData(() => getMyVerification());
  const renewals = useAsyncData(() => getMyRenewals());
  const list = renewals.data?.renewals || [];
  const current = pickRenewal(list, requestedId);

  return {
    verification,
    renewals,
    list,
    current,
    requestedId,
    license: verification.data,
    loading: verification.loading || renewals.loading,
    error: verification.error || renewals.error,
    reload: () => {
      verification.reload();
      renewals.reload();
    },
    reloadSilent: async () => {
      await Promise.all([verification.reload({ silent: true }), renewals.reload({ silent: true })]);
    },
  };
}

/** "EH-RENEW-00042" — a display label built from the real renewal id (not a made-up number). */
export function renewalReference(renewal) {
  return renewal ? `EH-RENEW-${String(renewal.renewal_id).padStart(5, '0')}` : '';
}
