// src/pages/RenewalStatusTracker.jsx — real-time status + timeline for a license renewal.
//   GET /license-renewals/me (renewal comes from ?renewal=ID, or the agent's most relevant one)
// Timeline events are derived only from real timestamps the renewal actually has (created_at,
// submitted_at, reviewed_at) — no invented dates or steps.

import { Link, Navigate } from 'react-router-dom';
import AgentLayout from '../components/agent/AgentLayout';
import DocumentUploader from '../components/agent/DocumentUploader';
import useRenewalData, { renewalReference } from '../components/agent/useRenewalData';
import { Card, DataState, Icon, StatusBadge, btnOutline, btnPrimary } from '../components/agent/agentUi';
import { RENEWAL_STATUS, formatDate, formatTimestamp } from '../components/agent/agentUtils';

const STATUS_COPY = {
  draft: { icon: 'edit_note', title: 'Draft', body: 'You haven’t added any documents yet.' },
  documents_pending: { icon: 'pending_actions', title: 'Documents added', body: 'Submit your renewal when you’re ready.' },
  submitted: { icon: 'hourglass_top', title: 'Submitted — awaiting review', body: 'Our compliance team will review your documents shortly.' },
  under_review: { icon: 'fact_check', title: 'Under review', body: 'Your documents are being reviewed by our compliance team.' },
  missing_documents: { icon: 'error', title: 'Action required: missing documents', body: 'The compliance team needs additional or clearer documents from you.' },
  approved: { icon: 'verified', title: 'Approved', body: 'Your license renewal was approved.' },
  rejected: { icon: 'gpp_bad', title: 'Not approved', body: 'Your renewal was not approved. See the details below.' },
};

function buildTimeline(renewal) {
  const events = [{ key: 'created', label: 'Renewal started', at: renewal.created_at, done: true }];
  if (renewal.submitted_at) events.push({ key: 'submitted', label: 'Submitted for review', at: renewal.submitted_at, done: true });
  if (renewal.status === 'missing_documents') events.push({ key: 'missing', label: 'Compliance requested more documents', at: renewal.updated_at, done: true, tone: 'error' });
  if (renewal.reviewed_at) {
    events.push({
      key: 'reviewed',
      label: renewal.status === 'approved' ? 'Approved' : renewal.status === 'rejected' ? 'Not approved' : 'Reviewed',
      at: renewal.reviewed_at,
      done: true,
      tone: renewal.status === 'rejected' ? 'error' : renewal.status === 'approved' ? 'success' : undefined,
    });
  } else if (['submitted', 'under_review'].includes(renewal.status)) {
    events.push({ key: 'pending', label: 'Awaiting a decision', done: false });
  }
  return events;
}

export default function RenewalStatusTracker() {
  const data = useRenewalData();
  const renewal = data.current;

  if (!data.loading && !data.error && !renewal) return <Navigate to="/agent-certification-tracking" replace />;

  const copy = renewal ? STATUS_COPY[renewal.status] : null;
  const timeline = renewal ? buildTimeline(renewal) : [];

  return (
    <AgentLayout active="renewal" title="Renewal status" subtitle="Track your license renewal from submission to decision." actions={<Link to="/messages" className={btnOutline}><Icon name="chat" className="text-[18px]" />Message support</Link>}>
      <DataState loading={data.loading} error={data.error} onRetry={data.reload} rows={4}>
        {renewal && copy && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card className="p-6" data-widget="renewal-status">
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-surface-container-low flex items-center justify-center text-primary flex-shrink-0"><Icon name={copy.icon} className="text-[28px]" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-headline-md font-headline-md text-primary">{copy.title}</h2>
                      <StatusBadge meta={RENEWAL_STATUS[renewal.status]} fallback={renewal.status} />
                    </div>
                    <p className="mt-1 text-body-md font-body-md text-on-surface-variant">{copy.body}</p>
                    <p className="mt-2 text-label-sm font-label-sm text-on-surface-variant">Reference {renewalReference(renewal)}</p>
                  </div>
                  {renewal.status === 'missing_documents' && (
                    <Link to={`/resolve-missing-documents?renewal=${renewal.renewal_id}`} className={btnPrimary}><Icon name="build" className="text-[18px]" />Fix issues</Link>
                  )}
                </div>
                {renewal.status === 'approved' && (
                  <div className="mt-4 rounded-lg bg-status-success/10 p-4 text-body-sm font-body-sm text-status-success">
                    New expiry date: <strong>{formatDate(renewal.new_expiry_date)}</strong>
                  </div>
                )}
              </Card>

              <Card className="p-6" data-widget="renewal-timeline">
                <h2 className="text-headline-md font-headline-md text-primary mb-5">Timeline</h2>
                <ol className="space-y-5">
                  {timeline.map((event, i) => (
                    <li key={event.key} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <span className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${event.tone === 'error' ? 'bg-error-container text-on-error-container' : event.done ? 'bg-status-success/15 text-status-success' : 'bg-surface-container text-on-surface-variant'}`}>
                          <Icon name={event.tone === 'error' ? 'priority_high' : event.done ? 'check' : 'schedule'} className="text-[16px]" />
                        </span>
                        {i < timeline.length - 1 && <span className="w-px flex-1 bg-border-subtle mt-1" />}
                      </div>
                      <div className="pb-1">
                        <p className="text-label-md font-label-md text-primary">{event.label}</p>
                        {event.at && <p className="text-label-sm font-label-sm text-on-surface-variant">{formatTimestamp(event.at)}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              </Card>
            </div>

            <Card className="p-6" data-widget="renewal-documents">
              <h2 className="text-headline-md font-headline-md text-primary mb-1">Documents on file</h2>
              <p className="text-body-sm font-body-sm text-on-surface-variant mb-4">{(renewal.documents || []).length} document{(renewal.documents || []).length === 1 ? '' : 's'}</p>
              <DocumentUploader documents={renewal.documents || []} types={['license']} canUpload={false} onUpload={async () => {}} onDelete={async () => {}} emptyText="No documents on this renewal." />
            </Card>
          </div>
        )}
      </DataState>
    </AgentLayout>
  );
}
