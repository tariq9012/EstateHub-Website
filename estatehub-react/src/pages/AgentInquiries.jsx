// src/pages/AgentInquiries.jsx
// Inquiries received for the signed-in agent's properties (GET /inquiries/received — agent from the JWT).
// Status actions use PUT /inquiries/:id/status (new | contacted | closed). Conversations are never
// re-implemented here: "Open conversation" deep-links to /messages?conversation=ID.

import { useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AgentLayout from '../components/agent/AgentLayout';
import useAsyncData from '../hooks/useAsyncData';
import { getReceivedInquiries, updateInquiryStatus } from '../api/inquiries';
import { DataState, Icon, StatusBadge, btnOutline, btnPrimary, inputClass, useToast } from '../components/agent/agentUi';
import { INQUIRY_STATUS, formatDate, formatTimestamp, fullName, timeAgo } from '../components/agent/agentUtils';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'closed', label: 'Closed' },
];

const EMPTY = {
  all: { title: 'No inquiries yet', body: 'When buyers contact you about one of your listings, their inquiries appear here.' },
  new: { title: 'No new inquiries', body: 'You’re all caught up.' },
  contacted: { title: 'No contacted inquiries', body: 'Inquiries you have marked as contacted appear here.' },
  closed: { title: 'No closed inquiries', body: 'Closed inquiries appear here.' },
};

// Actions per current status -> [target, label, style]. The server accepts any of the three statuses.
const ACTIONS = {
  new: [['contacted', 'Mark contacted', 'primary'], ['closed', 'Close', 'outline']],
  contacted: [['closed', 'Close', 'outline'], ['new', 'Mark as new', 'outline']],
  closed: [['new', 'Reopen', 'outline']],
};
const SUCCESS = { new: 'Inquiry reopened.', contacted: 'Marked as contacted.', closed: 'Inquiry closed.' };

function InquiryCard({ inquiry: i, busy, onAction }) {
  const buyer = fullName(i.first_name, i.last_name, 'Buyer');
  return (
    <article className="bg-surface-container-lowest border border-border-subtle rounded-2xl p-5 flex flex-col gap-4" data-inquiry-id={i.inquiry_id} data-status={i.status}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-11 h-11 rounded-full bg-surface-container-high text-primary flex items-center justify-center flex-shrink-0 border border-border-subtle text-label-md font-label-md" aria-hidden="true">
            {(buyer[0] || '?').toUpperCase()}
          </div>
          <div className="min-w-0">
            <h3 className="text-body-md font-body-md font-semibold text-primary break-words">{buyer}</h3>
            {i.email && <p className="text-body-sm font-body-sm text-on-surface-variant break-all">{i.email}</p>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-label-sm font-label-sm text-on-surface-variant" title={formatTimestamp(i.created_at)}>{timeAgo(i.created_at)}</span>
          <StatusBadge meta={INQUIRY_STATUS[i.status]} fallback={i.status} />
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-lg bg-surface-container-low border border-border-subtle p-3 min-w-0">
        <div className="w-12 h-12 rounded-lg bg-surface-container overflow-hidden flex-shrink-0 flex items-center justify-center text-on-surface-variant">
          {i.property_image_url ? <img className="w-full h-full object-cover" src={i.property_image_url} alt="" loading="lazy" /> : <Icon name="home" />}
        </div>
        <div className="min-w-0">
          <p className="text-label-sm font-label-sm text-on-surface-variant">About</p>
          <Link to={`/property-details/${i.property_id}`} className="text-label-md font-label-md text-primary hover:underline break-words">{i.property_title}</Link>
        </div>
      </div>

      <p className="text-body-md font-body-md text-on-surface whitespace-pre-wrap break-words">{i.message}</p>

      {i.preferred_visit_date && (
        <p className="flex items-center gap-2 text-body-sm font-body-sm text-on-surface-variant">
          <Icon name="event" className="text-[18px]" />
          Preferred viewing date: <span className="text-primary font-medium">{formatDate(i.preferred_visit_date)}</span>
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {(ACTIONS[i.status] || []).map(([target, label, style]) => (
          <button key={target} type="button" disabled={busy} onClick={() => onAction(i, target)} className={style === 'primary' ? btnPrimary : btnOutline} data-action={target}>
            {busy ? 'Saving…' : label}
          </button>
        ))}
        <Link to={`/property-details/${i.property_id}`} className={btnOutline}>View property</Link>
        {i.conversation_id && (
          <Link to={`/messages?conversation=${i.conversation_id}`} className={btnOutline}>
            <Icon name="mail" className="text-[18px]" />
            Open conversation
          </Link>
        )}
      </div>
    </article>
  );
}

export default function AgentInquiries() {
  const [params, setParams] = useSearchParams();
  const urlStatus = params.get('status');
  const status = FILTERS.some((f) => f.key === urlStatus) ? urlStatus : 'all';
  const [query, setQuery] = useState('');
  const [busyIds, setBusyIds] = useState(() => new Set());
  const busyRef = useRef(new Set());
  const { toast, show } = useToast();

  const inquiries = useAsyncData(() => getReceivedInquiries());
  const all = inquiries.data?.inquiries || [];

  const counts = useMemo(() => {
    const c = { all: all.length };
    FILTERS.slice(1).forEach((f) => { c[f.key] = all.filter((i) => i.status === f.key).length; });
    return c;
  }, [all]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((i) => {
      if (status !== 'all' && i.status !== status) return false;
      if (!q) return true;
      return [i.first_name, i.last_name, i.email, i.property_title, i.message].filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [all, status, query]);

  const handleAction = async (inquiry, target) => {
    const id = inquiry.inquiry_id;
    if (busyRef.current.has(id)) return;
    busyRef.current.add(id);
    setBusyIds(new Set(busyRef.current));
    try {
      await updateInquiryStatus(id, target);
      show('success', SUCCESS[target]);
    } catch (err) {
      show('error', err.message || 'Could not update this inquiry.');
    } finally {
      busyRef.current.delete(id);
      setBusyIds(new Set(busyRef.current));
      inquiries.reload({ silent: true });
    }
  };

  const searching = query.trim().length > 0;

  return (
    <AgentLayout active="inquiries" title="Inquiries" subtitle="Questions and viewing requests from buyers about your listings.">
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-5">
        <label className="relative block lg:w-96">
          <span className="sr-only">Search inquiries</span>
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-on-surface-variant pointer-events-none" />
          <input type="search" aria-label="Search inquiries" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search buyer, property, message…" className={`${inputClass} pl-10`} />
        </label>
        <div role="tablist" aria-label="Filter by status" className="flex-1 min-w-0 flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((f) => {
            const selected = f.key === status;
            return (
              <button key={f.key} type="button" role="tab" aria-selected={selected} onClick={() => setParams(f.key === 'all' ? {} : { status: f.key }, { replace: true })}
                className={`flex-shrink-0 min-h-[44px] px-4 rounded-full text-label-md font-label-md border transition-colors whitespace-nowrap ${selected ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container-lowest text-on-surface-variant border-border-subtle hover:bg-surface-container-low'}`}>
                {f.label}
                {!inquiries.loading && !inquiries.error && <span className={`ml-2 text-[11px] px-1.5 py-0.5 rounded-full ${selected ? 'bg-on-primary/20' : 'bg-surface-container'}`}>{counts[f.key]}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <DataState
        loading={inquiries.loading}
        error={inquiries.error}
        onRetry={() => inquiries.reload()}
        empty={visible.length === 0}
        rows={3}
        emptyProps={searching ? { icon: 'search_off', title: 'No matching inquiries', children: `Nothing matches “${query.trim()}”.` } : { icon: 'inbox', title: EMPTY[status].title, children: EMPTY[status].body }}
      >
        <ul className="space-y-4" aria-label="Inquiries">
          {visible.map((i) => (
            <li key={i.inquiry_id}>
              <InquiryCard inquiry={i} busy={busyIds.has(i.inquiry_id)} onAction={handleAction} />
            </li>
          ))}
        </ul>
      </DataState>
      {toast}
    </AgentLayout>
  );
}
