// src/pages/MyListings.jsx
// The signed-in agent's own properties (GET /agents/me/listings — the agent is derived from the JWT
// on the server; nothing here sends an agent id).
// Editing goes through the existing ListYourProperty flow at /edit-property/:id (no second form).

import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import AgentLayout from '../components/agent/AgentLayout';
import useAsyncData from '../hooks/useAsyncData';
import { getMyListings } from '../api/agents';
import { archiveProperty } from '../api/properties';
import { Card, DataState, Icon, StatusBadge, btnDanger, btnOutline, btnPrimary, inputClass, useToast } from '../components/agent/agentUi';
import { PROPERTY_STATUS, formatPrice, formatTimestamp } from '../components/agent/agentUtils';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'pending_review', label: 'Pending review' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'draft', label: 'Draft' },
  { key: 'under_contract', label: 'Under contract' },
  { key: 'sold', label: 'Sold' },
  { key: 'archived', label: 'Archived' },
];

// Mirrors the server's rules (utils/propertyRules.js); the API remains authoritative and answers 409 otherwise.
const EDITABLE = ['draft', 'pending_review', 'rejected', 'active'];
const ARCHIVABLE = ['draft', 'pending_review', 'rejected', 'active'];

const EMPTY_COPY = {
  all: { title: 'No listings yet', body: 'Add your first property to get started.' },
  active: { title: 'No active listings', body: 'Approved listings that are live to buyers appear here.' },
  pending_review: { title: 'Nothing pending review', body: 'Listings waiting for admin approval appear here.' },
  rejected: { title: 'No rejected listings', body: 'Listings that need changes appear here with the reviewer’s feedback.' },
  draft: { title: 'No drafts', body: 'Saved drafts appear here until you submit them for review.' },
  under_contract: { title: 'None under contract', body: 'Listings under contract appear here.' },
  sold: { title: 'No sold listings', body: 'Sold listings appear here.' },
  archived: { title: 'No archived listings', body: 'Archived listings appear here.' },
};

function ListingCard({ property: p, busy, onArchive }) {
  const [confirming, setConfirming] = useState(false);
  const editable = EDITABLE.includes(p.status);
  const location = [p.neighborhood, p.city].filter(Boolean).join(', ') || p.city;

  return (
    <article className="bg-surface-container-lowest border border-border-subtle rounded-2xl overflow-hidden flex flex-col md:flex-row" data-listing-id={p.property_id} data-status={p.status}>
      <Link to={`/property-details/${p.property_id}`} tabIndex={-1} aria-label={`View ${p.title}`} className="block md:w-56 flex-shrink-0 h-44 md:h-auto md:min-h-[190px] bg-surface-container relative">
        {p.primary_image_url ? (
          <img className="absolute inset-0 w-full h-full object-cover" src={p.primary_image_url} alt="" loading="lazy" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-on-surface-variant"><Icon name="home" className="text-[40px]" /></span>
        )}
      </Link>
      <div className="flex-1 min-w-0 p-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1 basis-48">
            <h3 className="text-body-md font-body-md font-semibold text-primary break-words">{p.title}</h3>
            <p className="mt-0.5 flex items-center gap-1 text-body-sm font-body-sm text-on-surface-variant">
              <Icon name="location_on" className="text-[16px] flex-shrink-0" />
              <span className="break-words min-w-0">{location}</span>
            </p>
          </div>
          <StatusBadge meta={PROPERTY_STATUS[p.status]} fallback={p.status} />
        </div>

        <p className="text-headline-md font-headline-md text-primary">{formatPrice(p.price)}<span className="text-body-sm font-body-sm text-on-surface-variant"> · {p.listing_type === 'rent' ? 'For rent' : 'For sale'}</span></p>
        <p className="text-body-sm font-body-sm text-on-surface-variant">
          {p.bedrooms ?? '—'} beds · {p.bathrooms ?? '—'} baths · {p.area_sqft ? `${Number(p.area_sqft).toLocaleString()} sq ft` : '— sq ft'} · {p.type_name}
        </p>
        <p className="text-label-sm font-label-sm text-on-surface-variant">
          {Number(p.image_count) || 0} photo{Number(p.image_count) === 1 ? '' : 's'} · {Number(p.inquiry_count) || 0} inquir{Number(p.inquiry_count) === 1 ? 'y' : 'ies'} · Created {formatTimestamp(p.created_at)}
        </p>

        {p.status === 'rejected' && (
          <div className="rounded-lg bg-error-container/50 border border-error/30 p-3" role="note">
            <p className="text-label-sm font-label-sm text-on-error-container">Reviewer feedback</p>
            <p className="text-body-sm font-body-sm text-primary whitespace-pre-wrap break-words">{p.rejection_reason || 'No reason was given.'}</p>
          </div>
        )}
        {p.status === 'pending_review' && <p className="text-label-sm font-label-sm text-on-surface-variant">Waiting for admin approval. It is not visible to buyers yet.</p>}
        {p.status === 'active' && <p className="text-label-sm font-label-sm text-on-surface-variant">Editing a live listing sends it back for review.</p>}

        {confirming ? (
          <div role="group" aria-label="Confirm archive" className="bg-error-container/40 border border-error/30 rounded-lg p-4">
            <p className="text-label-md font-label-md text-primary">Archive this listing?</p>
            <p className="text-body-sm font-body-sm text-on-surface-variant mt-1">It will be removed from search and can no longer be edited.</p>
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <button type="button" className={btnOutline} onClick={() => setConfirming(false)} disabled={busy}>Keep listing</button>
              <button type="button" className={btnDanger} disabled={busy} onClick={async () => { setConfirming(false); await onArchive(p); }}>Yes, archive</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 mt-auto">
            <Link to={`/property-details/${p.property_id}`} className={btnOutline}>View</Link>
            {editable && (
              <Link to={`/edit-property/${p.property_id}`} className={p.status === 'rejected' ? btnPrimary : btnOutline}>
                {p.status === 'rejected' ? 'Fix & resubmit' : 'Edit'}
              </Link>
            )}
            {editable && <Link to={`/edit-property/${p.property_id}?step=2`} className={btnOutline}>Manage images</Link>}
            {editable && <Link to={`/edit-property/${p.property_id}?step=3`} className={btnOutline}>Manage amenities</Link>}
            {ARCHIVABLE.includes(p.status) && (
              <button type="button" className={btnDanger} disabled={busy} onClick={() => setConfirming(true)}>
                {busy ? 'Archiving…' : 'Archive'}
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

export default function MyListings() {
  const [params, setParams] = useSearchParams();
  const urlStatus = params.get('status');
  const status = FILTERS.some((f) => f.key === urlStatus) ? urlStatus : 'all';
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState(null);
  const { toast, show } = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  // One-time message handed over by the edit flow ("Changes saved…").
  useEffect(() => {
    const flash = location.state && location.state.flash;
    if (flash) {
      show('success', flash);
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const listings = useAsyncData(() => getMyListings());
  const all = listings.data?.properties || [];

  const counts = useMemo(() => {
    const c = { all: all.length };
    FILTERS.slice(1).forEach((f) => { c[f.key] = all.filter((p) => p.status === f.key).length; });
    return c;
  }, [all]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((p) => {
      if (status !== 'all' && p.status !== status) return false;
      if (!q) return true;
      return [p.title, p.city, p.neighborhood, p.address_line, p.type_name].filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [all, status, query]);

  const handleArchive = async (property) => {
    if (busyId) return;
    setBusyId(property.property_id);
    try {
      await archiveProperty(property.property_id);
      show('success', 'Listing archived.');
    } catch (err) {
      show('error', err.message || 'Could not archive this listing.');
    } finally {
      setBusyId(null);
      listings.reload({ silent: true });
    }
  };

  const empty = EMPTY_COPY[status];
  const searching = query.trim().length > 0;

  return (
    <AgentLayout active="listings" title="My Listings" subtitle="Manage the properties assigned to you." actions={<Link to="/list-your-property" className={btnPrimary}><Icon name="add" className="text-[20px]" />Add Property</Link>}>
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-5">
        <label className="relative block lg:w-96">
          <span className="sr-only">Search listings</span>
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-on-surface-variant pointer-events-none" />
          <input type="search" aria-label="Search your listings" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title, city, address…" className={`${inputClass} pl-10`} />
        </label>
        <div role="tablist" aria-label="Filter by status" className="flex-1 min-w-0 flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((f) => {
            const selected = f.key === status;
            return (
              <button key={f.key} type="button" role="tab" aria-selected={selected} onClick={() => setParams(f.key === 'all' ? {} : { status: f.key }, { replace: true })}
                className={`flex-shrink-0 min-h-[44px] px-4 rounded-full text-label-md font-label-md border transition-colors whitespace-nowrap ${selected ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container-lowest text-on-surface-variant border-border-subtle hover:bg-surface-container-low'}`}>
                {f.label}
                {!listings.loading && !listings.error && <span className={`ml-2 text-[11px] px-1.5 py-0.5 rounded-full ${selected ? 'bg-on-primary/20' : 'bg-surface-container'}`}>{counts[f.key]}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <DataState
        loading={listings.loading}
        error={listings.error}
        onRetry={() => listings.reload()}
        empty={visible.length === 0}
        rows={3}
        emptyProps={
          searching
            ? { icon: 'search_off', title: 'No matching listings', children: `Nothing matches “${query.trim()}”${status !== 'all' ? ' in this status' : ''}.` }
            : { icon: 'sell', title: empty.title, children: empty.body, action: status === 'all' ? <Link to="/list-your-property" className={btnPrimary}>Add Property</Link> : undefined }
        }
      >
        <ul className="space-y-4" aria-label="Listings">
          {visible.map((p) => (
            <li key={p.property_id}>
              <ListingCard property={p} busy={busyId === p.property_id} onArchive={handleArchive} />
            </li>
          ))}
        </ul>
      </DataState>
      {toast}
    </AgentLayout>
  );
}
