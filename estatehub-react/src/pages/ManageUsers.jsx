// src/pages/ManageUsers.jsx
// Real user management: search, role/status filters, pagination, suspend/reactivate.
// "Add New User" was removed — there is no backend endpoint for an admin to create accounts
// (users sign up themselves via /register); inventing that button would be a UI that lies.

import { useState } from 'react';
import AdminLayout from '../components/admin/AdminLayout';
import useAsyncData from '../hooks/useAsyncData';
import { getAdminUsers, updateUserStatus } from '../api/admin';
import { useAuth } from '../context/AuthContext';
import { Card, DataState, StatusBadge, Icon, btnOutline, inputClass, useToast } from '../components/agent/agentUi';
import { formatTimestamp, fullName } from '../components/agent/agentUtils';
import { USER_STATUS, ROLE_LABELS } from '../components/admin/adminUtils';

const ROLE_OPTIONS = ['', 'buyer', 'agent', 'admin'];
const STATUS_OPTIONS = ['', 'active', 'suspended', 'deactivated'];

export default function ManageUsers() {
  const { user: currentUser } = useAuth();
  const isSuperAdmin = currentUser?.adminProfile?.permission_level === 'super_admin';
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState(null);
  const { toast, show } = useToast();

  const { data, loading, error, reload } = useAsyncData(
    () => getAdminUsers({ role: role || undefined, status: status || undefined, search: search || undefined, page, limit: 20 }),
    [role, status, search, page]
  );

  const submitSearch = (e) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const changeStatus = async (targetUser, newStatus) => {
    setBusyId(targetUser.user_id);
    try {
      await updateUserStatus(targetUser.user_id, newStatus);
      show('success', `${fullName(targetUser.first_name, targetUser.last_name)} is now ${newStatus}.`);
      reload({ silent: true });
    } catch (err) {
      show('error', err.message || 'Could not update this account.');
    } finally {
      setBusyId(null);
    }
  };

  const users = data?.users || [];
  const pagination = data?.pagination;

  return (
    <AdminLayout active="users" title="Manage Users" subtitle="Every buyer, agent, and admin account on EstateHub." wide>
      {!isSuperAdmin && (
        <div className="mb-6 rounded-xl bg-secondary-container text-on-secondary-container px-4 py-3 text-body-sm font-body-sm flex items-center gap-2">
          <Icon name="info" className="text-[18px]" />
          Only a super admin can change another admin's account status.
        </div>
      )}

      <form onSubmit={submitSearch} className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by name or email…"
          aria-label="Search users by name or email"
          className={`${inputClass} sm:max-w-xs`}
        />
        <select aria-label="Filter by role" className={inputClass + ' sm:max-w-[160px]'} value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}>
          {ROLE_OPTIONS.map((r) => (
            <option key={r || 'all'} value={r}>{r ? ROLE_LABELS[r] : 'All roles'}</option>
          ))}
        </select>
        <select aria-label="Filter by status" className={inputClass + ' sm:max-w-[160px]'} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          {STATUS_OPTIONS.map((s) => (
            <option key={s || 'all'} value={s}>{s ? (USER_STATUS[s]?.label || s) : 'All statuses'}</option>
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
        empty={!loading && !error && users.length === 0}
        emptyProps={{ icon: 'group', title: 'No accounts match these filters' }}
      >
        <Card className="divide-y divide-border-subtle overflow-hidden">
          {users.map((u) => {
            const isSelf = u.user_id === currentUser?.user_id;
            const isOtherAdmin = u.role === 'admin' && !isSelf;
            const canAct = !isSelf && (!isOtherAdmin || isSuperAdmin);
            const busy = busyId === u.user_id;
            return (
              <div key={u.user_id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-label-md font-label-md text-primary">{fullName(u.first_name, u.last_name)}</span>
                    <StatusBadge meta={USER_STATUS[u.status]} fallback={u.status} />
                    {isSelf && <span className="text-label-sm font-label-sm text-on-surface-variant">(you)</span>}
                  </div>
                  <p className="text-body-sm font-body-sm text-on-surface-variant mt-1">
                    {u.email} · {ROLE_LABELS[u.role] || u.role} · Joined {formatTimestamp(u.created_at)}
                  </p>
                </div>
                <div className="flex-shrink-0">
                  {u.status === 'active' ? (
                    <button
                      type="button"
                      className="text-error text-label-md font-label-md hover:underline disabled:opacity-40"
                      disabled={busy || !canAct}
                      title={!canAct ? "You can't change this account's status" : undefined}
                      onClick={() => changeStatus(u, 'suspended')}
                    >
                      Suspend
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={btnOutline}
                      disabled={busy || !canAct}
                      title={!canAct ? "You can't change this account's status" : undefined}
                      onClick={() => changeStatus(u, 'active')}
                    >
                      Reactivate
                    </button>
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
      {toast}
    </AdminLayout>
  );
}
