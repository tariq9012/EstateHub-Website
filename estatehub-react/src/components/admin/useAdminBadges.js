// src/components/admin/useAdminBadges.js
// Pending-item counters for the Admin navigation, sourced from real dashboard-stats data
// (properties.pendingApprovals / agents.pending / renewals awaiting review) — never fabricated.

import { useCallback, useEffect, useState } from 'react';
import { getDashboardStats } from '../../api/admin';

const REFRESH_MS = 60000;

export default function useAdminBadges() {
  const [badges, setBadges] = useState({ properties: 0, verification: 0, renewals: 0 });

  const load = useCallback(async () => {
    try {
      const stats = await getDashboardStats();
      const submitted = Number(stats?.renewals?.submittedRenewals) || 0;
      const underReview = Number(stats?.renewals?.underReviewRenewals) || 0;
      setBadges({
        properties: Number(stats?.properties?.pendingProperties) || 0,
        verification: Number(stats?.agents?.pendingVerifications) || 0,
        renewals: submitted + underReview,
      });
    } catch (err) {
      // Leave previous counts in place on a transient failure — nav badges aren't worth a toast.
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  return badges;
}
