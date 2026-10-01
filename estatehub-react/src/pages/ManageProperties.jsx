// src/pages/ManageProperties.jsx
// Real property moderation: search, status/listing-type filters, pagination, approve/reject.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../components/admin/AdminLayout';
import useAsyncData from '../hooks/useAsyncData';
import { getAdminProperties } from '../api/admin';
import { approveProperty, rejectProperty } from '../api/properties';
import DocumentRejectionReasonsModal from '../components/admin/DocumentRejectionReasonsModal';
import { Card, DataState, StatusBadge, Icon, btnOutline, inputClass, useToast } from '../components/agent/agentUi';
import { formatPrice, formatTimestamp, fullName, PROPERTY_STATUS } from '../components/agent/agentUtils';

const STATUS_OPTIONS = ['', 'pending_review', 'active', 'under_contract', 'sold', 'rejected', 'archived', 'draft'];
const LISTING_TYPE_OPTIONS = ['', 'sale', 'rent'];

export default function ManageProperties() {
  const [status, setStatus] = useState('pending_review');
  const [listingType, setListingType] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [rejecting, setRejecting] = useState(null); // property_id being rejected
  const [busyId, setBusyId] = useState(null);
  const { toast, show } = useToast();

  const { data, loading, error, reload } = useAsyncData(
    () => getAdminProperties({ status: status || undefined, listingType: listingType || undefined, search: search || undefined, page, limit: 20 }),
    [status, listingType, search, page]
  );

  const submitSearch = (e) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const doApprove = async (propertyId) => {
    setBusyId(propertyId);
    try {
      await approveProperty(propertyId);
      show('success', 'Listing approved and published.');
      reload({ silent: true });
    } catch (err) {
      show('error', err.message || 'Could not approve this listing.');
    } finally {
      setBusyId(null);
    }
  };

  const doReject = async (reason) => {
    setBusyId(rejecting);
    try {
      await rejectProperty(rejecting, reason);
      show('success', 'Listing rejected.');
      setRejecting(null);
      reload({ silent: true });
    } catch (err) {
      show('error', err.message || 'Could not reject this listing.');
    } finally {
      setBusyId(null);
    }
  };

  const properties = data?.properties || [];
  const pagination = data?.pagination;

  return (
    <AdminLayout active="properties" title="Manage Properties" subtitle="Review, approve, and moderate every listing on EstateHub." wide>
      <form onSubmit={submitSearch} className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by title or location…"
          aria-label="Search properties by title or location"
          className={`${inputClass} sm:max-w-xs`}
        />
        <select aria-label="Filter by status" className={inputClass + ' sm:max-w-[200px]'} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          {STATUS_OPTIONS.map((s) => (
            <option key={s || 'all'} value={s}>{s ? (PROPERTY_STATUS[s]?.label || s) : 'All statuses'}</option>
          ))}
        </select>
        <select aria-label="Filter by listing type" className={inputClass + ' sm:max-w-[160px]'} value={listingType} onChange={(e) => { setListingType(e.target.value); setPage(1); }}>
          {LISTING_TYPE_OPTIONS.map((t) => (
            <option key={t || 'all'} value={t}>{t ? (t === 'sale' ? 'For sale' : 'For rent') : 'Sale & rent'}</option>
          ))}
        </select>
        <button type="submit" className={btnOutline}>
          <Icon name="search" className="text-[18px]" /> Search
        </button>
      </form>

      <DataState
        loading={loading}
        error={error}
        onRetry={reload}
        empty={!loading && !error && properties.length === 0}
        emptyProps={{ icon: 'apartment', title: 'No listings match these filters' }}
      >
        <Card className="divide-y divide-border-subtle overflow-hidden">
          {properties.map((p) => {
            const meta = PROPERTY_STATUS[p.status];
            const busy = busyId === p.property_id;
            return (
              <div key={p.property_id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link to={`/property-details/${p.property_id}`} className="text-label-md font-label-md text-primary hover:underline truncate">
                      {p.title}
                    </Link>
                    <StatusBadge meta={meta} fallback={p.status} />
                  </div>
                  <p className="text-body-sm font-body-sm text-on-surface-variant mt-1">
                    {[p.city, p.country].filter(Boolean).join(', ')} · {p.type_name} · {p.listing_type === 'rent' ? 'For rent' : 'For sale'} · Listed by {fullName(p.lister_first_name, p.lister_last_name)} · {formatTimestamp(p.created_at)}
                  </p>
                  {p.status === 'rejected' && p.rejection_reason && (
                    <p className="text-body-sm font-body-sm text-error mt-1">Rejection reason: {p.rejection_reason}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-label-md font-label-md text-primary">{formatPrice(p.price)}</span>
                  {p.status === 'pending_review' && (
                    <>
                      <button type="button" className={btnOutline} disabled={busy} onClick={() => doApprove(p.property_id)}>
                        <Icon name="check" className="text-[18px]" /> Approve
                      </button>
                      <button type="button" className="text-error text-label-md font-label-md hover:underline disabled:opacity-50" disabled={busy} onClick={() => setRejecting(p.property_id)}>
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </Card>
      </DataState>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-6">
          <button type="button" className={btnOutline} disabled={pagination.page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span className="text-body-sm font-body-sm text-on-surface-variant">Page {pagination.page} of {pagination.totalPages}</span>
          <button type="button" className={btnOutline} disabled={pagination.page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}

      {rejecting && (
        <DocumentRejectionReasonsModal
          title="Reject this listing"
          description="This reason is shown to the listing agent."
          submitting={busyId === rejecting}
          onCancel={() => setRejecting(null)}
          onConfirm={doReject}
        />
      )}
      {toast}
    </AdminLayout>
  );
}
