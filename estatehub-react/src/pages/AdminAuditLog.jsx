// src/pages/AdminAuditLog.jsx
// New page — the Admin Portal spec calls for an audit log page, but none previously existed in
// the frontend even though the backend (admin_action_log) was already fully wired up.

import { useState } from 'react';
import AdminLayout from '../components/admin/AdminLayout';
import useAsyncData from '../hooks/useAsyncData';
import { getActionLog } from '../api/admin';
import { Card, DataState, Icon, btnOutline, inputClass } from '../components/agent/agentUi';
import { fullName, formatTimestamp } from '../components/agent/agentUtils';
import { formatActionType } from '../components/admin/adminUtils';

const TARGET_TYPES = ['', 'property', 'user', 'agent', 'document', 'license_renewal'];

export default function AdminAuditLog() {
  const [targetType, setTargetType] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useAsyncData(() => getActionLog({ targetType: targetType || undefined, page, limit: 30 }), [targetType, page]);

  const logs = data?.logs || [];
  const pagination = data?.pagination;

  return (
    <AdminLayout active="auditlog" title="Audit Log" subtitle="Every moderation and account-status decision made by an admin." wide>
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <select aria-label="Filter by target type" className={inputClass + ' sm:max-w-[220px]'} value={targetType} onChange={(e) => { setTargetType(e.target.value); setPage(1); }}>
          {TARGET_TYPES.map((t) => (
            <option key={t || 'all'} value={t}>{t ? formatActionType(t) : 'All target types'}</option>
          ))}
        </select>
      </div>

      <DataState
        loading={loading}
        error={error}
        onRetry={reload}
        empty={!loading && !error && logs.length === 0}
        emptyProps={{ icon: 'history', title: 'No admin actions recorded yet' }}
      >
        <Card className="divide-y divide-border-subtle overflow-hidden">
          {logs.map((log) => (
            <div key={log.log_id} className="flex items-start gap-4 px-5 py-4">
              <div className="mt-0.5 w-9 h-9 rounded-full bg-surface-container-low flex items-center justify-center flex-shrink-0">
                <Icon name="history" className="text-[18px] text-on-surface-variant" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-label-md font-label-md text-primary">{formatActionType(log.action_type)}</p>
                <p className="text-body-sm font-body-sm text-on-surface-variant mt-0.5">
                  {fullName(log.admin_first_name, log.admin_last_name, 'Admin')} · {formatActionType(log.target_type)} #{log.target_id} · {formatTimestamp(log.created_at)}
                </p>
                {log.notes && <p className="text-body-sm font-body-sm text-on-surface-variant mt-1">{log.notes}</p>}
              </div>
            </div>
          ))}
        </Card>
      </DataState>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-6">
          <button type="button" className={btnOutline} disabled={pagination.page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span className="text-body-sm font-body-sm text-on-surface-variant">Page {pagination.page} of {pagination.totalPages}</span>
          <button type="button" className={btnOutline} disabled={pagination.page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </AdminLayout>
  );
}
