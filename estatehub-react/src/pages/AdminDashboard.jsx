// src/pages/AdminDashboard.jsx
// Real-data admin overview. No fabricated revenue/growth numbers — every figure here comes
// straight from admin.model.js#getDashboardStats (users/properties/agents/renewals/inquiries).

import { Link } from 'react-router-dom';
import AdminLayout from '../components/admin/AdminLayout';
import useAsyncData from '../hooks/useAsyncData';
import { getDashboardStats } from '../api/admin';
import { Card, SectionHeader, StatCard, DataState, EmptyBox, Icon } from '../components/agent/agentUi';
import { formatPrice, formatTimestamp, timeAgo, fullName } from '../components/agent/agentUtils';
import { formatActionType } from '../components/admin/adminUtils';

export default function AdminDashboard() {
  const { data, loading, error, reload } = useAsyncData(() => getDashboardStats());

  const users = data?.users || {};
  const properties = data?.properties || {};
  const agents = data?.agents || {};
  const renewals = data?.renewals || {};
  const inquiries = data?.inquiries || {};

  return (
    <AdminLayout active="dashboard" title="Admin Dashboard" subtitle="Live counts from the EstateHub database — nothing here is estimated.">
      <DataState loading={loading} error={error} onRetry={reload} empty={false}>
        {data && (
          <div className="space-y-10 pb-10">
            {/* --- Stat grid --- */}
            <section>
              <SectionHeader title="Overview" />
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <StatCard icon="group" label="Total users" value={users.totalUsers ?? 0} hint={`${users.totalBuyers ?? 0} buyers · ${users.totalAgents ?? 0} agents`} />
                <StatCard icon="verified_user" label="Verified agents" value={agents.verifiedAgents ?? 0} to="/agent-verification-queue" />
                <StatCard icon="hourglass_top" label="Pending verifications" value={agents.pendingVerifications ?? 0} to="/agent-verification-queue" tone={agents.pendingVerifications > 0 ? 'error' : undefined} />
                <StatCard icon="apartment" label="Active properties" value={properties.activeProperties ?? 0} to="/manage-properties" />
                <StatCard icon="pending_actions" label="Pending property approvals" value={properties.pendingProperties ?? 0} to="/manage-properties" tone={properties.pendingProperties > 0 ? 'error' : undefined} />
                <StatCard icon="cancel" label="Rejected properties" value={properties.rejectedProperties ?? 0} to="/manage-properties" />
                <StatCard icon="badge" label="Pending license renewals" value={(renewals.submittedRenewals ?? 0) + (renewals.underReviewRenewals ?? 0)} to="/admin-review-queue" tone={(renewals.submittedRenewals || renewals.underReviewRenewals) ? 'error' : undefined} />
                <StatCard icon="forum" label="New inquiries" value={inquiries.newInquiries ?? 0} hint={`${inquiries.totalInquiries ?? 0} total`} />
              </div>
            </section>

            {/* --- Pending property approvals --- */}
            <section>
              <SectionHeader title="Pending property approvals" action={<Link to="/manage-properties" className="text-label-md font-label-md text-primary hover:underline">View all</Link>} />
              <Card className="divide-y divide-border-subtle">
                {(data.pendingProperties || []).length === 0 ? (
                  <EmptyBox icon="task_alt" title="Nothing waiting on you" compact>No listings are pending review right now.</EmptyBox>
                ) : (
                  data.pendingProperties.map((p) => (
                    <Link key={p.property_id} to="/manage-properties" className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-surface-container-low transition-colors">
                      <div className="min-w-0">
                        <p className="text-label-md font-label-md text-primary truncate">{p.title}</p>
                        <p className="text-body-sm font-body-sm text-on-surface-variant">{[p.city, p.country].filter(Boolean).join(', ')} · Submitted {timeAgo(p.created_at)}</p>
                      </div>
                      <span className="text-label-md font-label-md text-primary whitespace-nowrap">{formatPrice(p.price)}</span>
                    </Link>
                  ))
                )}
              </Card>
            </section>

            {/* --- Pending agent verifications --- */}
            <section>
              <SectionHeader title="Pending agent verifications" action={<Link to="/agent-verification-queue" className="text-label-md font-label-md text-primary hover:underline">View all</Link>} />
              <Card className="divide-y divide-border-subtle">
                {(data.pendingAgents || []).length === 0 ? (
                  <EmptyBox icon="task_alt" title="No agents waiting" compact>Every submitted agent verification has been reviewed.</EmptyBox>
                ) : (
                  data.pendingAgents.map((a) => (
                    <Link key={a.agent_id} to="/agent-verification-queue" className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-surface-container-low transition-colors">
                      <div className="min-w-0">
                        <p className="text-label-md font-label-md text-primary truncate">{fullName(a.first_name, a.last_name, 'Agent')}</p>
                        <p className="text-body-sm font-body-sm text-on-surface-variant">License {a.license_number} · Submitted {timeAgo(a.created_at)}</p>
                      </div>
                      <Icon name="chevron_right" className="text-on-surface-variant" />
                    </Link>
                  ))
                )}
              </Card>
            </section>

            {/* --- Recent admin actions --- */}
            <section>
              <SectionHeader title="Recent admin actions" action={<Link to="/admin-audit-log" className="text-label-md font-label-md text-primary hover:underline">Full audit log</Link>} />
              <Card className="divide-y divide-border-subtle">
                {(data.recentActions || []).length === 0 ? (
                  <EmptyBox icon="history" title="No admin activity yet" compact>Moderation and account actions will show up here.</EmptyBox>
                ) : (
                  data.recentActions.map((a) => (
                    <div key={a.log_id} className="flex items-center justify-between gap-4 px-5 py-4">
                      <div className="min-w-0">
                        <p className="text-label-md font-label-md text-primary truncate">{formatActionType(a.action_type)}</p>
                        <p className="text-body-sm font-body-sm text-on-surface-variant">
                          {fullName(a.admin_first_name, a.admin_last_name, 'Admin')} · {a.target_type} #{a.target_id} · {formatTimestamp(a.created_at)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </Card>
            </section>
          </div>
        )}
      </DataState>
    </AdminLayout>
  );
}
