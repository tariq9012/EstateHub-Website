// src/pages/AgentDashboard.jsx
// Agent home: real numbers + previews from the existing APIs (nothing hard-coded).
//  listings      GET /agents/me/listings
//  inquiries     GET /inquiries/received
//  viewings      GET /appointments/agent      (preview only — the manager lives at /appointments)
//  messages      GET /conversations           (preview only — chat lives at /messages)
//  rating        GET /agents/:id              (agent id comes from the signed-in user)
//  verification  GET /verification/me   +  renewals GET /license-renewals/me
//  notifications GET /notifications
// Each widget loads independently, so one failing request never blanks the page, and a stat whose
// source failed shows "—" (never a made-up number).

import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AgentLayout from '../components/agent/AgentLayout';
import useAsyncData from '../hooks/useAsyncData';
import { getMyListings, getAgent } from '../api/agents';
import { getReceivedInquiries } from '../api/inquiries';
import { getAgentAppointments } from '../api/appointments';
import { listConversations } from '../api/conversations';
import { getMyVerification } from '../api/verification';
import { getMyRenewals } from '../api/licenseRenewals';
import { listNotifications } from '../api/notifications';
import { Card, DataState, EmptyBox, Icon, SectionHeader, StatCard, StatusBadge, btnOutline, btnPrimary } from '../components/agent/agentUi';
import {
  INQUIRY_STATUS,
  PROPERTY_STATUS,
  VERIFICATION_STATUS,
  formatDate,
  formatPrice,
  fullName,
  licenseCountdown,
  timeAgo,
} from '../components/agent/agentUtils';
import { formatViewingDateTime, isUpcoming, parseScheduledAt } from '../components/appointments/appointmentUtils';

const PREVIEW = 4;

/** Alerts derived only from real data (verification, license expiry, renewals, rejected listings/documents). */
export function buildAlerts({ verification, renewals, listings }) {
  const alerts = [];
  if (verification) {
    const status = verification.verificationStatus;
    if (status === 'unverified') {
      alerts.push({ key: 'verify', tone: 'warning', icon: 'verified_user', title: 'Complete your agent verification', body: 'Upload your license and submit your profile for review.', to: '/agent-verification', cta: 'Start verification' });
    } else if (status === 'rejected') {
      alerts.push({ key: 'verify', tone: 'error', icon: 'gpp_bad', title: 'Your verification was not approved', body: 'Review the feedback on your documents, fix them and resubmit.', to: '/agent-verification', cta: 'Review documents' });
    } else if (status === 'pending') {
      alerts.push({ key: 'verify', tone: 'neutral', icon: 'hourglass_top', title: 'Verification is in review', body: 'We will notify you when the review is complete.', to: '/agent-verification', cta: 'View status' });
    }
    const rejectedDocs = (verification.documents || []).filter((d) => d.status === 'rejected').length;
    if (rejectedDocs > 0) {
      alerts.push({ key: 'docs', tone: 'error', icon: 'description', title: `${rejectedDocs} verification document${rejectedDocs === 1 ? ' was' : 's were'} rejected`, body: 'Replace them to continue.', to: '/agent-verification', cta: 'Replace documents' });
    }
    const openRenewal = (renewals || []).find((r) => ['draft', 'documents_pending', 'submitted', 'under_review', 'missing_documents'].includes(r.status));
    const countdown = licenseCountdown(verification.licenseExpiryDate);
    if (openRenewal && openRenewal.status === 'missing_documents') {
      alerts.push({ key: 'renewal', tone: 'error', icon: 'error', title: 'Your license renewal needs more documents', body: 'The review team is waiting on you.', to: '/resolve-missing-documents', cta: 'Resolve now' });
    } else if (countdown.state === 'expired') {
      alerts.push({ key: 'license', tone: 'error', icon: 'event_busy', title: `Your license expired on ${formatDate(verification.licenseExpiryDate)}`, body: 'Renew it to keep your account in good standing.', to: openRenewal ? '/renewal-status-tracker' : '/submit-license-renewal', cta: openRenewal ? 'Track renewal' : 'Renew now' });
    } else if (countdown.state === 'expiring' && !openRenewal) {
      alerts.push({ key: 'license', tone: 'warning', icon: 'event', title: `Your license expires in ${countdown.days} day${countdown.days === 1 ? '' : 's'}`, body: `Expiry date: ${formatDate(verification.licenseExpiryDate)}.`, to: '/submit-license-renewal', cta: 'Start renewal' });
    } else if (countdown.state === 'unknown') {
      alerts.push({ key: 'license', tone: 'neutral', icon: 'event', title: 'Add your license expiry date', body: 'We need it to track renewals for you.', to: '/agent-verification', cta: 'Add date' });
    }
  }
  const rejectedListings = (listings || []).filter((p) => p.status === 'rejected').length;
  if (rejectedListings > 0) {
    alerts.push({ key: 'listings', tone: 'error', icon: 'report', title: `${rejectedListings} listing${rejectedListings === 1 ? ' was' : 's were'} rejected`, body: 'Open them to see the reviewer feedback, then edit and resubmit.', to: '/my-listings?status=rejected', cta: 'Review listings' });
  }
  return alerts;
}

const ALERT_TONE = {
  error: 'bg-error-container/50 border-error/30',
  warning: 'bg-secondary-container/60 border-border-subtle',
  neutral: 'bg-surface-container-low border-border-subtle',
};

function AlertList({ alerts }) {
  if (alerts.length === 0) return null;
  return (
    <div className="space-y-3 mb-6" aria-label="Alerts">
      {alerts.map((a) => (
        <div key={a.key} className={`flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border p-4 ${ALERT_TONE[a.tone]}`} data-alert={a.key}>
          <Icon name={a.icon} className={`text-[24px] ${a.tone === 'error' ? 'text-error' : 'text-primary'}`} />
          <div className="flex-1 min-w-0">
            <p className="text-label-md font-label-md text-primary">{a.title}</p>
            <p className="text-body-sm font-body-sm text-on-surface-variant">{a.body}</p>
          </div>
          <Link to={a.to} className={`${btnOutline} bg-surface-container-lowest`}>
            {a.cta}
          </Link>
        </div>
      ))}
    </div>
  );
}

function statValue(source, compute) {
  if (source.loading) return '…';
  if (source.error || !source.data) return '—';
  return compute(source.data);
}
const statHint = (source, hint) => (source.error ? "Couldn't load" : hint);

export default function AgentDashboard() {
  const { user } = useAuth();
  const agentId = user?.agentProfile?.agent_id;

  const listings = useAsyncData(() => getMyListings());
  const inquiries = useAsyncData(() => getReceivedInquiries());
  const viewings = useAsyncData(() => getAgentAppointments());
  const conversations = useAsyncData(() => listConversations());
  const profile = useAsyncData(() => (agentId ? getAgent(agentId) : Promise.resolve(null)), [agentId]);
  const verification = useAsyncData(() => getMyVerification());
  const renewals = useAsyncData(() => getMyRenewals());
  const notifications = useAsyncData(() => listNotifications({ limit: 5 }));

  const propertyList = listings.data?.properties || [];
  const inquiryList = inquiries.data?.inquiries || [];
  const upcoming = (viewings.data?.appointments || [])
    .filter((a) => isUpcoming(a))
    .sort((a, b) => parseScheduledAt(a.scheduled_at) - parseScheduledAt(b.scheduled_at));
  const convoList = conversations.data?.conversations || [];
  const unreadMessages = convoList.reduce((sum, c) => sum + (Number(c.unread_count) || 0), 0);
  const noteList = notifications.data?.notifications || [];

  const alerts = buildAlerts({ verification: verification.data, renewals: renewals.data?.renewals, listings: propertyList });
  const countdown = licenseCountdown(verification.data?.licenseExpiryDate);
  const verificationMeta = VERIFICATION_STATUS[verification.data?.verificationStatus];
  const rating = profile.data?.agent;

  return (
    <AgentLayout active="dashboard" title={`Welcome back${user?.first_name ? `, ${user.first_name}` : ''}`} subtitle="Your listings, leads and compliance at a glance." actions={<Link to="/list-your-property" className={btnPrimary}><Icon name="add" className="text-[20px]" />Add Property</Link>}>
      {(verification.data || listings.data) && <AlertList alerts={alerts} />}

      <section aria-label="Key numbers" className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon="sell" label="Active listings" to="/my-listings?status=active" value={statValue(listings, (d) => d.properties.filter((p) => p.status === 'active').length)} hint={statHint(listings, `${propertyList.length} in total`)} />
        <StatCard icon="pending_actions" label="Pending review" to="/my-listings?status=pending_review" value={statValue(listings, (d) => d.properties.filter((p) => p.status === 'pending_review').length)} hint={statHint(listings, 'Awaiting approval')} />
        <StatCard icon="inbox" label="Total inquiries" to="/agent-inquiries" value={statValue(inquiries, (d) => d.inquiries.length)} hint={statHint(inquiries, `${inquiryList.filter((i) => i.status === 'new').length} new`)} />
        <StatCard icon="calendar_month" label="Upcoming viewings" to="/appointments" value={statValue(viewings, () => upcoming.length)} hint={statHint(viewings, 'Requested + confirmed')} />
        <StatCard icon="mail" label="Unread messages" to="/messages" value={statValue(conversations, () => unreadMessages)} hint={statHint(conversations, `${convoList.length} conversation${convoList.length === 1 ? '' : 's'}`)} />
        <StatCard icon="star" label="Average rating" to="/agent-reviews" value={profile.loading ? '…' : rating ? (Number(rating.total_reviews) > 0 ? Number(rating.average_rating).toFixed(1) : '—') : '—'} hint={profile.error ? "Couldn't load" : rating ? `${Number(rating.total_reviews) || 0} review${Number(rating.total_reviews) === 1 ? '' : 's'}` : ''} />
        <StatCard icon="verified_user" label="Verification" to="/agent-verification" value={verification.loading ? '…' : verificationMeta ? verificationMeta.label : '—'} hint={verification.error ? "Couldn't load" : ''} tone={verification.data?.verificationStatus === 'rejected' ? 'error' : undefined} />
        <StatCard icon="workspace_premium" label="License expiry" to="/agent-certification-tracking" value={verification.loading ? '…' : countdown.date ? formatDate(verification.data.licenseExpiryDate) : verification.error ? '—' : 'Not set'} hint={countdown.state === 'expired' ? 'Expired' : countdown.state === 'expiring' ? `${countdown.days} days left` : countdown.state === 'valid' ? `${countdown.days} days left` : verification.error ? "Couldn't load" : ''} tone={countdown.state === 'expired' ? 'error' : undefined} />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6" data-widget="inquiries">
          <SectionHeader title="Recent inquiries" action={<Link to="/agent-inquiries" className="text-label-md font-label-md text-primary hover:underline">View all</Link>} />
          <DataState loading={inquiries.loading} error={inquiries.error} onRetry={inquiries.reload} rows={3} compact empty={inquiryList.length === 0} emptyProps={{ icon: 'inbox', title: 'No inquiries yet', children: 'When buyers contact you about a listing, they appear here.' }}>
            <ul className="divide-y divide-border-subtle">
              {inquiryList.slice(0, PREVIEW).map((i) => (
                <li key={i.inquiry_id} className="py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-label-md font-label-md text-primary truncate">{fullName(i.first_name, i.last_name, 'Buyer')} · <span className="font-normal text-on-surface-variant">{i.property_title}</span></p>
                    <p className="text-body-sm font-body-sm text-on-surface-variant truncate">{i.message}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-label-sm font-label-sm">
                      <span className="text-on-surface-variant">{timeAgo(i.created_at)}</span>
                      {i.conversation_id && <Link to={`/messages?conversation=${i.conversation_id}`} className="text-primary hover:underline">Open conversation</Link>}
                    </div>
                  </div>
                  <StatusBadge meta={INQUIRY_STATUS[i.status]} fallback={i.status} />
                </li>
              ))}
            </ul>
          </DataState>
        </Card>

        <Card className="p-6" data-widget="viewings">
          <SectionHeader title="Upcoming viewings" action={<Link to="/appointments" className="text-label-md font-label-md text-primary hover:underline">View all</Link>} />
          <DataState loading={viewings.loading} error={viewings.error} onRetry={viewings.reload} rows={3} compact empty={upcoming.length === 0} emptyProps={{ icon: 'event_available', title: 'No upcoming viewings', children: 'Viewing requests for your listings will appear here.' }}>
            <ul className="divide-y divide-border-subtle">
              {upcoming.slice(0, 3).map((a) => (
                <li key={a.appointment_id}>
                  <Link to="/appointments" className="py-3 flex items-start justify-between gap-3 hover:bg-surface-container-low rounded-lg -mx-2 px-2 transition-colors">
                    <div className="min-w-0">
                      <p className="text-label-md font-label-md text-primary truncate">{a.property_title}</p>
                      <p className="text-body-sm font-body-sm text-on-surface-variant">{fullName(a.buyer_first_name || a.first_name, a.buyer_last_name || a.last_name, 'Buyer')}</p>
                      <p className="text-label-sm font-label-sm text-on-surface-variant mt-1">{formatViewingDateTime(a.scheduled_at)}</p>
                    </div>
                    <span className={`text-label-sm font-label-sm px-3 py-1 rounded-full whitespace-nowrap ${a.status === 'confirmed' ? 'bg-status-success/10 text-status-success' : 'bg-secondary-container text-on-secondary-container'}`}>{a.status === 'confirmed' ? 'Confirmed' : 'Requested'}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </DataState>
        </Card>

        <Card className="p-6" data-widget="messages">
          <SectionHeader title="Recent messages" action={<Link to="/messages" className="text-label-md font-label-md text-primary hover:underline">View all</Link>} />
          <DataState loading={conversations.loading} error={conversations.error} onRetry={conversations.reload} rows={3} compact empty={convoList.length === 0} emptyProps={{ icon: 'forum', title: 'No conversations yet', children: 'Messages from buyers will appear here.' }}>
            <ul className="divide-y divide-border-subtle">
              {convoList.slice(0, PREVIEW).map((c) => (
                <li key={c.conversation_id}>
                  <Link to={`/messages?conversation=${c.conversation_id}`} className="py-3 flex items-start justify-between gap-3 hover:bg-surface-container-low rounded-lg -mx-2 px-2 transition-colors">
                    <div className="min-w-0">
                      <p className="text-label-md font-label-md text-primary truncate">{fullName(c.other_first_name, c.other_last_name)}{c.property_title ? <span className="font-normal text-on-surface-variant"> · {c.property_title}</span> : null}</p>
                      <p className="text-body-sm font-body-sm text-on-surface-variant truncate">{c.last_message_text || 'No messages yet'}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-label-sm font-label-sm text-on-surface-variant">{timeAgo(c.last_message_at || c.created_at)}</span>
                      {Number(c.unread_count) > 0 && <span className="bg-primary text-on-primary text-[10px] px-1.5 py-0.5 rounded-full" aria-label={`${c.unread_count} unread`}>{c.unread_count}</span>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </DataState>
        </Card>

        <Card className="p-6" data-widget="listings">
          <SectionHeader title="My properties" action={<Link to="/my-listings" className="text-label-md font-label-md text-primary hover:underline">View all</Link>} />
          <DataState loading={listings.loading} error={listings.error} onRetry={listings.reload} rows={3} compact empty={propertyList.length === 0} emptyProps={{ icon: 'add_home', title: 'No listings yet', children: 'Add your first property to get started.', action: <Link to="/list-your-property" className={btnPrimary}>Add Property</Link> }}>
            <ul className="divide-y divide-border-subtle">
              {propertyList.slice(0, PREVIEW).map((p) => (
                <li key={p.property_id}>
                  <Link to="/my-listings" className="py-3 flex items-center gap-3 hover:bg-surface-container-low rounded-lg -mx-2 px-2 transition-colors">
                    <div className="w-14 h-14 rounded-lg bg-surface-container overflow-hidden flex-shrink-0 flex items-center justify-center text-on-surface-variant">
                      {p.primary_image_url ? <img className="w-full h-full object-cover" src={p.primary_image_url} alt="" /> : <Icon name="home" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-label-md font-label-md text-primary truncate">{p.title}</p>
                      <p className="text-body-sm font-body-sm text-on-surface-variant">{formatPrice(p.price)} · {p.city}</p>
                    </div>
                    <StatusBadge meta={PROPERTY_STATUS[p.status]} fallback={p.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </DataState>
        </Card>

        <Card className="p-6 lg:col-span-2" data-widget="notifications">
          <SectionHeader title="Recent notifications" action={<Link to="/agent-notifications" className="text-label-md font-label-md text-primary hover:underline">View all</Link>} />
          <DataState loading={notifications.loading} error={notifications.error} onRetry={notifications.reload} rows={2} compact empty={noteList.length === 0} emptyProps={{ icon: 'notifications_none', title: 'No notifications', children: 'Updates about your listings, viewings and verification show up here.' }}>
            <ul className="divide-y divide-border-subtle">
              {noteList.map((n) => (
                <li key={n.notification_id} className="py-3 flex items-start gap-3">
                  <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${n.is_read ? 'bg-transparent' : 'bg-primary'}`} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className={`text-body-sm font-body-sm text-primary ${n.is_read ? '' : 'font-semibold'}`}>{n.title}</p>
                    {n.body && <p className="text-body-sm font-body-sm text-on-surface-variant truncate">{n.body}</p>}
                  </div>
                  <span className="text-label-sm font-label-sm text-on-surface-variant whitespace-nowrap">{timeAgo(n.created_at)}</span>
                </li>
              ))}
            </ul>
          </DataState>
        </Card>
      </div>
    </AgentLayout>
  );
}
