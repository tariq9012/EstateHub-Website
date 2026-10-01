// src/pages/Appointments.jsx
// Authenticated appointments manager.
//  - buyers (and admins acting as buyers): viewings THEY requested   -> GET /appointments/me
//  - agents: viewings booked with THEM                               -> GET /appointments/agent
// Identity comes from the JWT on the server. This page never sends a user or agent id, and
// only shows actions listed in each appointment's server-computed `available_actions`.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getAgentAppointments, getMyAppointments, updateAppointmentStatus } from '../api/appointments';
import AccountSidebar, { homePathForRole } from '../components/AccountSidebar';
import AppointmentCard from '../components/appointments/AppointmentCard';
import { ACTION_META, TAB_KEYS, countByTab, matchesTab, sortForTab } from '../components/appointments/appointmentUtils';

const POLL_MS = 30000;

function tabLabel(tab, mode) {
  const agent = mode === 'agent';
  return {
    upcoming: 'Upcoming',
    pending: agent ? 'Requests' : 'Pending',
    completed: 'Completed',
    cancelled: 'Cancelled',
    all: 'All',
    needs_update: agent ? 'Needs update' : 'Awaiting update',
  }[tab];
}

function emptyCopy(tab, mode) {
  const agent = mode === 'agent';
  return {
    upcoming: { title: 'No upcoming viewings', body: agent ? 'Confirmed and requested viewings with future dates will appear here.' : 'When you request a viewing, it will appear here until it takes place.' },
    pending: { title: agent ? 'No new viewing requests' : 'No pending requests', body: agent ? 'New viewing requests from buyers will appear here.' : 'Viewings waiting for the agent to confirm will appear here.' },
    completed: { title: 'No completed viewings', body: 'Viewings that have taken place will appear here.' },
    cancelled: { title: 'No cancelled viewings', body: 'Cancelled viewings and no-shows will appear here.' },
    all: { title: 'No viewings yet', body: agent ? 'Viewing requests for your listings will appear here.' : 'Request a viewing from any property page to get started.' },
    needs_update: { title: 'Nothing needs updating', body: 'Viewings whose time has passed without an update will appear here.' },
  }[tab];
}

function CardSkeleton() {
  return (
    <div className="bg-surface-container-lowest border border-border-subtle rounded-2xl overflow-hidden flex flex-col md:flex-row animate-pulse" aria-hidden="true">
      <div className="md:w-56 lg:w-64 h-44 md:h-48 bg-surface-container-high" />
      <div className="flex-1 p-5 space-y-4">
        <div className="h-4 w-2/3 rounded bg-surface-container-high" />
        <div className="h-3 w-1/3 rounded bg-surface-container" />
        <div className="grid sm:grid-cols-2 gap-3"><div className="h-8 rounded bg-surface-container" /><div className="h-8 rounded bg-surface-container" /></div>
        <div className="h-11 w-40 rounded-lg bg-surface-container-high" />
      </div>
    </div>
  );
}

export default function Appointments() {
  const { user } = useAuth();
  const mode = user?.role === 'agent' ? 'agent' : 'buyer';
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');
  const hasUrlTab = TAB_KEYS.includes(urlTab);

  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyIds, setBusyIds] = useState(() => new Set());
  const [toast, setToast] = useState(null); // { type: 'success' | 'error', message }
  const [defaultTab, setDefaultTab] = useState('upcoming');
  const [initialLoaded, setInitialLoaded] = useState(false); // avoids a highlighted tab that then flips once we know the counts

  const busyRef = useRef(new Set()); // synchronous guard against double clicks
  const reqRef = useRef(0);
  const loadingRef = useRef(false);
  const firstLoadDone = useRef(false);
  const toastTimer = useRef(null);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (silent && loadingRef.current) return;
      const reqId = ++reqRef.current;
      if (!silent) {
        loadingRef.current = true;
        setLoading(true);
        setError('');
      }
      try {
        const data = await (mode === 'agent' ? getAgentAppointments() : getMyAppointments());
        if (reqId !== reqRef.current) return;
        const list = data?.appointments || [];
        setAppointments(list);
        setError('');
        if (!firstLoadDone.current) {
          firstLoadDone.current = true;
          // Agents land on new requests when there are any.
          if (mode === 'agent' && countByTab(list).pending > 0) setDefaultTab('pending');
        }
      } catch (err) {
        if (reqId !== reqRef.current) return;
        if (!silent) setError(err.message || 'Could not load your appointments.');
      } finally {
        if (reqId === reqRef.current) {
          loadingRef.current = false;
          setLoading(false);
          setInitialLoaded(true);
        }
      }
    },
    [mode]
  );

  useEffect(() => {
    load();
  }, [load]);

  // Gentle auto-refresh (new requests / status changes made by the other party).
  const pollRef = useRef(null);
  pollRef.current = () => {
    if (document.visibilityState === 'visible' && busyRef.current.size === 0) load({ silent: true });
  };
  useEffect(() => {
    const timer = setInterval(() => pollRef.current(), POLL_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const showToast = (type, message) => {
    clearTimeout(toastTimer.current);
    setToast({ type, message });
    if (type === 'success') toastTimer.current = setTimeout(() => setToast(null), 5000);
  };

  const handleAction = async (appt, target) => {
    const id = appt.appointment_id;
    if (busyRef.current.has(id)) return; // already saving this one
    busyRef.current.add(id);
    setBusyIds(new Set(busyRef.current));
    try {
      const data = await updateAppointmentStatus(id, target);
      if (data?.appointment) {
        setAppointments((prev) => prev.map((a) => (a.appointment_id === id ? { ...a, ...data.appointment } : a)));
      }
      showToast('success', ACTION_META[target].success);
    } catch (err) {
      showToast('error', err.message || 'Could not update this viewing. Please try again.');
      // Something changed under us (or we're out of date): resync with the server.
      if (err.status === 409 || err.status === 404 || err.status === 403) load({ silent: true });
    } finally {
      busyRef.current.delete(id);
      setBusyIds(new Set(busyRef.current));
      load({ silent: true });
    }
  };

  const counts = useMemo(() => countByTab(appointments), [appointments]); // eslint-disable-line react-hooks/exhaustive-deps
  const activeTab = hasUrlTab ? urlTab : defaultTab;
  const visibleTabs = TAB_KEYS.filter((t) => t !== 'needs_update' || counts.needs_update > 0 || activeTab === 'needs_update');
  const list = useMemo(
    () => sortForTab(appointments.filter((a) => matchesTab(a, activeTab)), activeTab),
    [appointments, activeTab] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const homePath = homePathForRole(user?.role);
  const selectTab = (tab) => setSearchParams({ tab }, { replace: true });
  const empty = emptyCopy(activeTab, mode);

  let body;
  if (loading) {
    body = (
      <div className="space-y-4" role="status" aria-label="Loading appointments">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  } else if (error) {
    body = (
      <div className="bg-surface-container-lowest border border-border-subtle rounded-2xl p-10 text-center" role="alert">
        <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-error-container flex items-center justify-center text-on-error-container">
          <span aria-hidden="true" className="material-symbols-outlined">error</span>
        </div>
        <p className="text-label-md font-label-md text-primary mb-1">Couldn’t load your appointments</p>
        <p className="text-body-sm font-body-sm text-on-surface-variant mb-5">{error}</p>
        <button type="button" onClick={() => load()} className="min-h-[44px] bg-primary text-on-primary text-label-md font-label-md py-2.5 px-6 rounded-lg hover:opacity-90 transition-opacity">
          Try again
        </button>
      </div>
    );
  } else if (list.length === 0) {
    body = (
      <div className="bg-surface-container-lowest border border-border-subtle rounded-2xl p-10 text-center">
        <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant">
          <span aria-hidden="true" className="material-symbols-outlined">event_busy</span>
        </div>
        <p className="text-label-md font-label-md text-primary mb-1">{empty.title}</p>
        <p className="text-body-sm font-body-sm text-on-surface-variant max-w-sm mx-auto">{empty.body}</p>
        {mode === 'buyer' && (activeTab === 'upcoming' || activeTab === 'all') && (
          <Link to="/browse-properties" className="mt-5 inline-flex items-center justify-center min-h-[44px] bg-primary text-on-primary text-label-md font-label-md py-2.5 px-6 rounded-lg hover:opacity-90 transition-opacity">
            Browse Properties
          </Link>
        )}
      </div>
    );
  } else {
    body = (
      <ul className="space-y-4">
        {list.map((appt) => (
          <li key={appt.appointment_id}>
            <AppointmentCard appointment={appt} mode={mode} busy={busyIds.has(appt.appointment_id)} onAction={handleAction} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <>
      {/* TopNavBar (Mobile Only) */}
      <header className="flex bg-surface-container-lowest border-b border-border-subtle shadow-sm justify-between items-center w-full px-margin-mobile h-20 fixed top-0 z-50 md:hidden">
        <div className="text-headline-md font-headline-md font-extrabold tracking-tight text-primary">Appointments</div>
        <div className="flex items-center gap-4">
          <Link to="/messages" aria-label="Messages" className="p-1"><span aria-hidden="true" className="material-symbols-outlined text-primary">mail</span></Link>
          <Link to={homePath} aria-label="Back to dashboard" className="p-1"><span aria-hidden="true" className="material-symbols-outlined text-primary">home</span></Link>
        </div>
      </header>

      <AccountSidebar active="appointments" />

      <main className="ml-0 md:ml-64 pt-24 md:pt-0 min-h-dvh pb-24">
        <div className="max-w-[1100px] mx-auto px-margin-mobile md:px-8 lg:px-10">
          <div className="hidden md:flex justify-between items-end pt-8 pb-6">
            <div>
              <h1 className="text-headline-lg font-headline-lg text-primary">Appointments</h1>
              <p className="text-body-md font-body-md text-on-surface-variant mt-2">
                {mode === 'agent' ? 'Manage viewing requests for your listings.' : 'Track the property viewings you have requested.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-5">
            <div role="tablist" aria-label="Appointment filters" className="flex-1 min-w-0 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {visibleTabs.map((tab) => {
                const selected = tab === activeTab && (initialLoaded || hasUrlTab);
                return (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => selectTab(tab)}
                    className={`flex-shrink-0 min-h-[44px] px-4 rounded-full text-label-md font-label-md border transition-colors whitespace-nowrap ${
                      selected ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container-lowest text-on-surface-variant border-border-subtle hover:bg-surface-container-low'
                    }`}
                  >
                    {tabLabel(tab, mode)}
                    {!loading && !error && (
                      <span className={`ml-2 text-[11px] px-1.5 py-0.5 rounded-full ${selected ? 'bg-on-primary/20' : 'bg-surface-container'}`} aria-label={`${counts[tab]} viewings`}>
                        {counts[tab]}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => load()}
              disabled={loading}
              aria-label="Refresh appointments"
              className="flex-shrink-0 min-w-[44px] min-h-[44px] rounded-full border border-border-subtle bg-surface-container-lowest hover:bg-surface-container-low transition-colors disabled:opacity-50 flex items-center justify-center"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-primary">refresh</span>
            </button>
          </div>

          <div role="tabpanel" aria-label={tabLabel(activeTab, mode)}>{body}</div>
        </div>
      </main>

      {toast && (
        <div className="fixed bottom-4 inset-x-4 md:inset-x-auto md:right-6 md:w-96 z-[60]">
          <div
            role={toast.type === 'error' ? 'alert' : 'status'}
            className={`flex items-start gap-3 rounded-xl border p-4 shadow-lg ${toast.type === 'error' ? 'bg-error-container text-on-error-container border-error/30' : 'bg-surface-container-lowest text-primary border-border-subtle'}`}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[20px] flex-shrink-0">{toast.type === 'error' ? 'error' : 'check_circle'}</span>
            <p className="flex-1 text-body-sm font-body-sm">{toast.message}</p>
            <button type="button" onClick={() => setToast(null)} aria-label="Dismiss message" className="-m-2 p-2 rounded-full hover:bg-black/5">
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
