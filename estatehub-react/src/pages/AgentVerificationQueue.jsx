// src/pages/AgentVerificationQueue.jsx
// Real agent verification queue: filter by status, link into the per-agent review page.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../components/admin/AdminLayout';
import useAsyncData from '../hooks/useAsyncData';
import { getVerificationQueue } from '../api/verification';
import { Card, DataState, StatusBadge, Icon } from '../components/agent/agentUi';
import { fullName, timeAgo, VERIFICATION_STATUS } from '../components/agent/agentUtils';

const STATUS_TABS = ['pending', 'verified', 'rejected', 'unverified'];

export default function AgentVerificationQueue() {
  const [status, setStatus] = useState('pending');
  const { data, loading, error, reload } = useAsyncData(() => getVerificationQueue(status), [status]);
  const agents = data?.agents || [];

  return (
    <AdminLayout active="verification" title="Agent Verification" subtitle="Review submitted licenses and documents before an agent goes live.">
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={`whitespace-nowrap px-4 py-2 rounded-full text-label-md font-label-md transition-colors ${
              status === s ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            {VERIFICATION_STATUS[s]?.label || s}
          </button>
        ))}
      </div>

      <DataState
        loading={loading}
        error={error}
        onRetry={reload}
        empty={!loading && !error && agents.length === 0}
        emptyProps={{ icon: 'verified_user', title: `No agents with status "${VERIFICATION_STATUS[status]?.label || status}"` }}
      >
        <Card className="divide-y divide-border-subtle overflow-hidden">
          {agents.map((a) => (
            <Link
              key={a.agent_id}
              to={`/agent-verification-review?agentId=${a.agent_id}`}
              className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-surface-container-low transition-colors"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-label-md font-label-md text-primary truncate">{fullName(a.first_name, a.last_name)}</span>
                  <StatusBadge meta={VERIFICATION_STATUS[a.verification_status]} fallback={a.verification_status} />
                </div>
                <p className="text-body-sm font-body-sm text-on-surface-variant mt-1">
                  {a.email} · License {a.license_number || '—'} · Submitted {timeAgo(a.created_at)}
                </p>
              </div>
              <Icon name="chevron_right" className="text-on-surface-variant flex-shrink-0" />
            </Link>
          ))}
        </Card>
      </DataState>
    </AdminLayout>
  );
}
