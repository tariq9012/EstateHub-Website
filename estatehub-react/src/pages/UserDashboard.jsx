import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { listFavorites, removeFavorite } from '../api/favorites';
import { listRecentlyViewed } from '../api/recentlyViewed';
import { getMyInquiries } from '../api/inquiries';
import { getMyAppointments } from '../api/appointments';
import { formatViewingDateTime, isUpcoming, parseScheduledAt } from '../components/appointments/appointmentUtils';
import { listNotifications, markNotificationRead, markAllNotificationsRead } from '../api/notifications';
import { listConversations } from '../api/conversations';
import { getMyNotificationPreferences, updateMyNotificationPreferences } from '../api/users';

function formatPrice(value) {
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return `$${num.toLocaleString()}`;
}

function formatLocation(item) {
  return [item.neighborhood, item.city].filter(Boolean).join(', ') || item.city || '—';
}

function timeAgo(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString.replace(' ', 'T'));
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

const INQUIRY_STATUS_STYLES = {
  new: 'bg-secondary-container text-on-secondary-container',
  contacted: 'bg-surface-container-high text-primary',
  closed: 'bg-surface-container text-on-surface-variant',
};

const APPOINTMENT_STATUS_STYLES = {
  requested: 'bg-secondary-container text-on-secondary-container',
  confirmed: 'bg-status-success/10 text-status-success',
  completed: 'bg-surface-container text-on-surface-variant',
  cancelled: 'bg-error-container text-on-error-container',
  no_show: 'bg-error-container text-on-error-container',
};

export default function UserDashboard() {
  const { user } = useAuth();

  const [favorites, setFavorites] = useState([]);
  const [favLoading, setFavLoading] = useState(true);
  const [favError, setFavError] = useState('');

  const [recent, setRecent] = useState([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentError, setRecentError] = useState('');

  const [inquiries, setInquiries] = useState([]);
  const [inqLoading, setInqLoading] = useState(true);
  const [inqError, setInqError] = useState('');

  const [appointments, setAppointments] = useState([]);
  const [apptLoading, setApptLoading] = useState(true);
  const [apptError, setApptError] = useState('');

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifLoading, setNotifLoading] = useState(true);
  const [notifError, setNotifError] = useState('');

  const [conversations, setConversations] = useState([]);
  const [convLoading, setConvLoading] = useState(true);
  const [convError, setConvError] = useState('');

  const [prefs, setPrefs] = useState(null);
  const [prefsSaving, setPrefsSaving] = useState(false);

  const loadFavorites = () => {
    setFavLoading(true);
    setFavError('');
    listFavorites()
      .then((data) => setFavorites(data.favorites || []))
      .catch((err) => setFavError(err.message || 'Could not load saved properties.'))
      .finally(() => setFavLoading(false));
  };

  useEffect(() => {
    loadFavorites();

    setRecentLoading(true);
    listRecentlyViewed(6)
      .then((data) => setRecent(data.properties || []))
      .catch((err) => setRecentError(err.message || 'Could not load recently viewed properties.'))
      .finally(() => setRecentLoading(false));

    setInqLoading(true);
    getMyInquiries()
      .then((data) => setInquiries(data.inquiries || []))
      .catch((err) => setInqError(err.message || 'Could not load inquiries.'))
      .finally(() => setInqLoading(false));

    setApptLoading(true);
    getMyAppointments()
      .then((data) => setAppointments(data.appointments || []))
      .catch((err) => setApptError(err.message || 'Could not load appointments.'))
      .finally(() => setApptLoading(false));

    setNotifLoading(true);
    listNotifications({ limit: 8 })
      .then((data) => {
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      })
      .catch((err) => setNotifError(err.message || 'Could not load notifications.'))
      .finally(() => setNotifLoading(false));

    setConvLoading(true);
    listConversations()
      .then((data) => setConversations(data.conversations || []))
      .catch((err) => setConvError(err.message || 'Could not load messages.'))
      .finally(() => setConvLoading(false));

    getMyNotificationPreferences()
      .then((data) => setPrefs(data.preferences))
      .catch(() => setPrefs(null));
  }, []);

  const handleRemoveFavorite = async (propertyId) => {
    setFavorites((prev) => prev.filter((f) => f.property_id !== propertyId));
    try {
      await removeFavorite(propertyId);
    } catch (err) {
      loadFavorites(); // resync on failure
    }
  };

  const handleMarkRead = async (notificationId) => {
    setNotifications((prev) => prev.map((n) => (n.notification_id === notificationId ? { ...n, is_read: 1 } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await markNotificationRead(notificationId);
    } catch (err) {
      // best-effort — leave optimistic state
    }
  };

  const handleMarkAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
    setUnreadCount(0);
    try {
      await markAllNotificationsRead();
    } catch (err) {
      // best-effort
    }
  };

  const togglePref = async (key) => {
    if (!prefs) return;
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    setPrefsSaving(true);
    try {
      await updateMyNotificationPreferences({
        emailNotifications: updated.email_notifications,
        smsNotifications: updated.sms_notifications,
        pushNotifications: updated.push_notifications,
      });
    } catch (err) {
      // revert on failure
      setPrefs(prefs);
    } finally {
      setPrefsSaving(false);
    }
  };

  const upcomingAppointments = appointments
    .filter((a) => isUpcoming(a))
    .sort((a, b) => parseScheduledAt(a.scheduled_at) - parseScheduledAt(b.scheduled_at));

  const activeInquiries = inquiries.filter((i) => i.status !== 'closed');
  const unreadMessages = conversations.reduce((sum, c) => sum + (Number(c.unread_count) || 0), 0);

  const greetingName = user?.first_name || 'there';
  const avatarInitial = (user?.first_name || '?')[0];

  return (
    <>
      {/* TopNavBar (Mobile Only) */}
      <header className="bg-surface-container-lowest dark:bg-primary-container border-b border-border-subtle dark:border-outline-variant shadow-sm dark:shadow-none flex justify-between items-center w-full px-margin-mobile max-w-container-max mx-auto h-20 fixed top-0 w-full z-50 md:hidden">
        <div className="text-headline-md font-headline-md font-extrabold tracking-tight text-primary dark:text-on-primary">
          EstateHub
        </div>
        <div className="flex items-center gap-4">
          <Link to="/browse-properties" aria-label="Browse Properties">
            <span className="material-symbols-outlined text-primary">search</span>
          </Link>
          <Link to="/messages" className="relative" aria-label="Messages">
            <span className="material-symbols-outlined text-primary">mail</span>
            {unreadMessages > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-error rounded-full text-[10px] text-white flex items-center justify-center">
                {unreadMessages > 9 ? '9+' : unreadMessages}
              </span>
            )}
          </Link>
          <a href="#notifications" className="relative">
            <span className="material-symbols-outlined text-primary">notifications</span>
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-error rounded-full text-[10px] text-white flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </a>
          <div className="w-8 h-8 rounded-full bg-surface-container-high overflow-hidden flex items-center justify-center text-primary font-label-md">
            {user?.avatar_url ? <img className="w-full h-full object-cover" src={user.avatar_url} alt={greetingName} /> : <span>{avatarInitial}</span>}
          </div>
        </div>
      </header>
      {/* SideNavBar (Desktop) */}
      <aside className="bg-surface dark:bg-primary-container border-r border-border-subtle dark:border-outline-variant shadow-xl dark:shadow-none fixed left-0 top-0 h-full flex flex-col p-4 z-40 hidden md:flex w-64">
        <div className="mb-8 pl-4 pt-4">
          <div className="text-headline-md font-headline-md font-black text-primary dark:text-on-primary">
            EstateHub
          </div>
          <div className="text-label-sm font-label-sm text-on-surface-variant mt-1">
            Premium Real Estate
          </div>
        </div>
        <nav className="flex-1 flex flex-col gap-2">
          <a className="flex items-center gap-3 text-on-surface-variant dark:text-on-primary-container px-4 py-3 hover:bg-surface-container-low hover:bg-surface-container-high dark:hover:bg-surface-variant transition-all rounded-lg" href="#top">
            <span className="material-symbols-outlined">home</span>
            <span className="text-label-md font-label-md">Overview</span>
          </a>
          <Link className="flex items-center gap-3 text-on-surface-variant dark:text-on-primary-container px-4 py-3 hover:bg-surface-container-low hover:bg-surface-container-high dark:hover:bg-surface-variant transition-all rounded-lg" to="/browse-properties">
            <span className="material-symbols-outlined">search</span>
            <span className="text-label-md font-label-md">Browse Properties</span>
          </Link>
          <a className="flex items-center gap-3 text-on-surface-variant dark:text-on-primary-container px-4 py-3 hover:bg-surface-container-low hover:bg-surface-container-high dark:hover:bg-surface-variant transition-all rounded-lg" href="#saved">
            <span className="material-symbols-outlined">bookmark</span>
            <span className="text-label-md font-label-md">Saved</span>
          </a>
          <Link className="flex items-center gap-3 text-on-surface-variant dark:text-on-primary-container px-4 py-3 hover:bg-surface-container-low hover:bg-surface-container-high dark:hover:bg-surface-variant transition-all rounded-lg" to="/messages">
            <span className="material-symbols-outlined">mail</span>
            <span className="text-label-md font-label-md">Messages</span>
            {unreadMessages > 0 && (
              <span className="ml-auto bg-primary text-on-primary text-[10px] px-1.5 py-0.5 rounded-full">{unreadMessages > 99 ? '99+' : unreadMessages}</span>
            )}
          </Link>
          <Link className="flex items-center gap-3 text-on-surface-variant dark:text-on-primary-container px-4 py-3 hover:bg-surface-container-low hover:bg-surface-container-high dark:hover:bg-surface-variant transition-all rounded-lg" to="/appointments">
            <span className="material-symbols-outlined">event</span>
            <span className="text-label-md font-label-md">Appointments</span>
          </Link>
          <a className="flex items-center gap-3 text-on-surface-variant dark:text-on-primary-container px-4 py-3 hover:bg-surface-container-low hover:bg-surface-container-high dark:hover:bg-surface-variant transition-all rounded-lg mt-auto" href="#settings">
            <span className="material-symbols-outlined">settings</span>
            <span className="text-label-md font-label-md">Settings</span>
          </a>
        </nav>
        <div className="mt-8 pt-4 border-t border-border-subtle">
          <Link className="w-full bg-primary text-on-primary text-label-md font-label-md py-3 rounded-lg hover:opacity-90 transition-opacity block text-center" to="/list-your-property">
            List Your Property
          </Link>
        </div>
      </aside>
      {/* Main Content Area */}
      <main id="top" className="flex-1 ml-0 md:ml-64 pt-20 md:pt-0 overflow-y-auto px-margin-mobile md:px-margin-desktop py-8">
        {/* Header Section */}
        <div className="flex justify-between items-end mb-8">
          <div>
            <h1 className="text-headline-lg font-headline-lg text-primary">
              Welcome back, {greetingName}
            </h1>
            <p className="text-body-md font-body-md text-on-surface-variant mt-2">
              Here is what's happening with your properties today.
            </p>
          </div>
          <div className="hidden md:flex items-center gap-6">
            <a href="#notifications" className="relative p-2 rounded-full hover:bg-surface-container-high transition-colors">
              <span className="material-symbols-outlined text-on-surface-variant">notifications</span>
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-error rounded-full border-2 border-surface"></span>
              )}
            </a>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-surface-container-high overflow-hidden border border-border-subtle flex items-center justify-center text-primary font-label-md">
                {user?.avatar_url ? <img className="w-full h-full object-cover" src={user.avatar_url} alt={greetingName} /> : <span>{avatarInitial}</span>}
              </div>
              <div className="hidden lg:block">
                <p className="text-label-md font-label-md text-primary">{user?.first_name} {user?.last_name}</p>
                <p className="text-label-sm font-label-sm text-on-surface-variant">{user?.email}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-surface-container-lowest p-6 rounded-xl border border-border-subtle ambient-shadow flex items-start justify-between">
            <div>
              <p className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider mb-2">Saved Properties</p>
              <p className="text-headline-xl font-headline-xl text-primary">{favLoading ? '—' : favorites.length}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center text-on-secondary-container">
              <span className="material-symbols-outlined">favorite</span>
            </div>
          </div>
          <div className="bg-surface-container-lowest p-6 rounded-xl border border-border-subtle ambient-shadow flex items-start justify-between">
            <div>
              <p className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider mb-2">Active Inquiries</p>
              <p className="text-headline-xl font-headline-xl text-primary">{inqLoading ? '—' : activeInquiries.length}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center text-primary">
              <span className="material-symbols-outlined">chat_bubble_outline</span>
            </div>
          </div>
          <div className="bg-primary p-6 rounded-xl border border-primary ambient-shadow flex items-start justify-between text-on-primary">
            <div>
              <p className="text-label-sm font-label-sm text-surface-dim uppercase tracking-wider mb-2">Upcoming Viewings</p>
              <p className="text-headline-xl font-headline-xl text-on-primary">{apptLoading ? '—' : upcomingAppointments.length}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-surface-container-high/20 flex items-center justify-center">
              <span className="material-symbols-outlined">event_upcoming</span>
            </div>
          </div>
        </div>

        {/* Dashboard Bento Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          <div className="xl:col-span-2 space-y-8">
            {/* Recently Viewed */}
            <section>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-headline-md font-headline-md text-primary">Recently Viewed</h2>
              </div>
              {recentLoading ? (
                <p className="text-body-md font-body-md text-on-surface-variant">Loading…</p>
              ) : recentError ? (
                <p className="text-body-md font-body-md text-error">{recentError}</p>
              ) : recent.length === 0 ? (
                <p className="text-body-md font-body-md text-on-surface-variant">You haven't viewed any properties yet.</p>
              ) : (
                <div className="flex gap-6 overflow-x-auto pb-6 hide-scrollbar snap-x">
                  {recent.map((property) => (
                    <Link
                      key={property.property_id}
                      to={`/property-details/${property.property_id}`}
                      className="min-w-[280px] md:min-w-[320px] bg-surface-container-lowest rounded-2xl border border-border-subtle overflow-hidden ambient-shadow snap-start group cursor-pointer transition-transform hover:-translate-y-1 duration-300 block"
                    >
                      <div className="relative h-48 w-full overflow-hidden bg-surface-container">
                        {property.primary_image_url ? (
                          <img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" src={property.primary_image_url} alt={property.title} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-on-surface-variant">
                            <span className="material-symbols-outlined text-[36px]">home</span>
                          </div>
                        )}
                        <div className="absolute bottom-3 left-3 bg-surface-container-lowest/90 backdrop-blur-md px-3 py-1 rounded-full text-label-sm font-label-sm text-primary font-bold">
                          {formatPrice(property.price)}
                        </div>
                      </div>
                      <div className="p-4">
                        <p className="text-body-sm font-body-sm text-on-surface-variant mb-1 line-clamp-1">
                          {formatLocation(property)}
                        </p>
                        <div className="flex items-center gap-4 text-label-sm font-label-sm text-on-surface-variant mt-3">
                          <div className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">bed</span>
                            {property.bedrooms ?? '—'}
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">shower</span>
                            {property.bathrooms ?? '—'}
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {/* Saved Properties */}
            <section id="saved">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-headline-md font-headline-md text-primary">Saved Properties</h2>
              </div>
              {favLoading ? (
                <p className="text-body-md font-body-md text-on-surface-variant">Loading…</p>
              ) : favError ? (
                <p className="text-body-md font-body-md text-error">{favError}</p>
              ) : favorites.length === 0 ? (
                <p className="text-body-md font-body-md text-on-surface-variant">No saved properties yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {favorites.map((property) => (
                    <div key={property.property_id} className="bg-surface-container-lowest rounded-2xl border border-border-subtle overflow-hidden ambient-shadow group">
                      <Link to={`/property-details/${property.property_id}`} className="block">
                        <div className="relative h-40 w-full overflow-hidden bg-surface-container">
                          {property.primary_image_url ? (
                            <img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" src={property.primary_image_url} alt={property.title} />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-on-surface-variant">
                              <span className="material-symbols-outlined text-[32px]">home</span>
                            </div>
                          )}
                          <div className="absolute bottom-3 left-3 bg-surface-container-lowest/90 backdrop-blur-md px-3 py-1 rounded-full text-label-sm font-label-sm text-primary font-bold">
                            {formatPrice(property.price)}
                          </div>
                        </div>
                      </Link>
                      <div className="p-4">
                        <p className="text-label-md font-label-md text-primary line-clamp-1">{property.title}</p>
                        <p className="text-body-sm font-body-sm text-on-surface-variant mb-3">{formatLocation(property)}</p>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 text-label-sm font-label-sm text-on-surface-variant">
                            <span className="flex items-center gap-1"><span className="material-symbols-outlined text-sm">bed</span>{property.bedrooms ?? '—'}</span>
                            <span className="flex items-center gap-1"><span className="material-symbols-outlined text-sm">shower</span>{property.bathrooms ?? '—'}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveFavorite(property.property_id)}
                            className="text-error text-label-sm font-label-sm hover:underline"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Inquiries */}
            <section id="inquiries">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-headline-md font-headline-md text-primary">My Inquiries</h2>
              </div>
              {inqLoading ? (
                <p className="text-body-md font-body-md text-on-surface-variant">Loading…</p>
              ) : inqError ? (
                <p className="text-body-md font-body-md text-error">{inqError}</p>
              ) : inquiries.length === 0 ? (
                <p className="text-body-md font-body-md text-on-surface-variant">No inquiries yet.</p>
              ) : (
                <div className="space-y-3">
                  {inquiries.map((inquiry) => (
                    <div key={inquiry.inquiry_id} className="bg-surface-container-lowest rounded-xl border border-border-subtle p-4 flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-label-md font-label-md text-primary truncate">{inquiry.property_title}</p>
                        <p className="text-body-sm font-body-sm text-on-surface-variant line-clamp-1 mt-1">{inquiry.message}</p>
                        <p className="text-label-sm font-label-sm text-on-surface-variant mt-1">{timeAgo(inquiry.created_at)}</p>
                      </div>
                      <span className={`text-label-sm font-label-sm px-3 py-1 rounded-full capitalize flex-shrink-0 ${INQUIRY_STATUS_STYLES[inquiry.status] || 'bg-surface-container text-on-surface-variant'}`}>
                        {inquiry.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Messages Preview */}
            <section id="messages" className="bg-surface-container-lowest rounded-2xl border border-border-subtle p-6 ambient-shadow">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-headline-md font-headline-md text-primary">Recent Messages</h2>
                <Link to="/messages" className="text-label-md font-label-md text-primary hover:underline">
                  View all
                </Link>
              </div>
              {convLoading ? (
                <p className="text-body-md font-body-md text-on-surface-variant">Loading…</p>
              ) : convError ? (
                <p className="text-body-md font-body-md text-error">{convError}</p>
              ) : conversations.length === 0 ? (
                <p className="text-body-md font-body-md text-on-surface-variant">No conversations yet.</p>
              ) : (
                <div className="space-y-3">
                  {conversations.slice(0, 5).map((conv) => (
                    <Link
                      key={conv.conversation_id}
                      to={`/messages?conversation=${conv.conversation_id}`}
                      className="flex items-center justify-between gap-4 py-2 border-b border-border-subtle last:border-0 hover:bg-surface-container-low transition-colors rounded-lg px-2 -mx-2"
                    >
                      <div className="min-w-0">
                        <p className="text-label-md font-label-md text-primary">
                          {conv.other_first_name} {conv.other_last_name}
                          {conv.unread_count > 0 && (
                            <span className="ml-2 bg-primary text-on-primary text-[10px] px-1.5 py-0.5 rounded-full">{conv.unread_count}</span>
                          )}
                        </p>
                        {conv.property_title && (
                          <p className="text-label-sm font-label-sm text-on-surface-variant truncate">{conv.property_title}</p>
                        )}
                      </div>
                      <span className="text-label-sm font-label-sm text-on-surface-variant flex-shrink-0">
                        {timeAgo(conv.last_message_at || conv.created_at)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {/* Settings: Notification Preferences */}
            <section id="settings" className="bg-surface-container-lowest rounded-2xl border border-border-subtle p-6 ambient-shadow">
              <h2 className="text-headline-md font-headline-md text-primary mb-2">Account</h2>
              <p className="text-body-sm font-body-sm text-on-surface-variant mb-6">{user?.first_name} {user?.last_name} · {user?.email}</p>
              <h3 className="text-label-md font-label-md text-primary mb-4">Notification Preferences</h3>
              {!prefs ? (
                <p className="text-body-sm font-body-sm text-on-surface-variant">Loading preferences…</p>
              ) : (
                <div className="space-y-3">
                  {[
                    { key: 'email_notifications', label: 'Email notifications' },
                    { key: 'sms_notifications', label: 'SMS notifications' },
                    { key: 'push_notifications', label: 'Push notifications' },
                  ].map((item) => (
                    <label key={item.key} className="flex items-center justify-between py-2">
                      <span className="text-body-sm font-body-sm text-on-surface-variant">{item.label}</span>
                      <input
                        type="checkbox"
                        className="w-5 h-5 rounded text-primary focus:ring-primary"
                        checked={!!prefs[item.key]}
                        disabled={prefsSaving}
                        onChange={() => togglePref(item.key)}
                      />
                    </label>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Right Column: Notifications + Appointments */}
          <div className="xl:col-span-1 space-y-8">
            {/* Notifications */}
            <section id="notifications" className="bg-surface-container-lowest rounded-2xl border border-border-subtle p-6 ambient-shadow">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-headline-md font-headline-md text-primary">Notifications</h2>
                {unreadCount > 0 && (
                  <button type="button" onClick={handleMarkAllRead} className="text-label-sm font-label-sm text-primary hover:underline">
                    Mark all read
                  </button>
                )}
              </div>
              {notifLoading ? (
                <p className="text-body-md font-body-md text-on-surface-variant">Loading…</p>
              ) : notifError ? (
                <p className="text-body-md font-body-md text-error">{notifError}</p>
              ) : notifications.length === 0 ? (
                <p className="text-body-md font-body-md text-on-surface-variant">No notifications yet.</p>
              ) : (
                <div className="space-y-3">
                  {notifications.map((n) => (
                    <div
                      key={n.notification_id}
                      className={`p-3 rounded-lg border ${n.is_read ? 'border-border-subtle' : 'border-primary bg-surface-container-low'}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-label-md font-label-md text-primary">{n.title}</p>
                        {!n.is_read && (
                          <button type="button" onClick={() => handleMarkRead(n.notification_id)} className="text-label-sm font-label-sm text-primary hover:underline flex-shrink-0">
                            Mark read
                          </button>
                        )}
                      </div>
                      {n.body && <p className="text-body-sm font-body-sm text-on-surface-variant mt-1">{n.body}</p>}
                      <p className="text-label-sm font-label-sm text-on-surface-variant mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Upcoming Appointments */}
            <section id="appointments" className="bg-surface-container-lowest rounded-2xl border border-border-subtle p-6 h-full ambient-shadow flex flex-col">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-headline-md font-headline-md text-primary">Upcoming Viewings</h2>
                <Link to="/appointments" className="text-label-md font-label-md text-primary hover:underline">
                  View all
                </Link>
              </div>
              {apptLoading ? (
                <p className="text-body-md font-body-md text-on-surface-variant">Loading…</p>
              ) : apptError ? (
                <p className="text-body-md font-body-md text-error">{apptError}</p>
              ) : upcomingAppointments.length === 0 ? (
                <p className="text-body-md font-body-md text-on-surface-variant">No upcoming viewings scheduled.</p>
              ) : (
                <div className="flex-1 space-y-6">
                  {upcomingAppointments.slice(0, 3).map((appt) => (
                    <div key={appt.appointment_id} className="relative pl-6 before:content-[''] before:absolute before:left-[11px] before:top-[28px] before:bottom-[-24px] before:w-px before:bg-border-subtle last:before:hidden">
                      <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-surface-container-highest flex items-center justify-center border-4 border-surface-container-lowest z-10">
                        <div className="w-2 h-2 rounded-full bg-primary"></div>
                      </div>
                      <div>
                        <p className="text-label-sm font-label-sm text-on-surface-variant mb-1">{formatViewingDateTime(appt.scheduled_at)}</p>
                        <div className="bg-surface rounded-xl p-4 border border-border-subtle">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-label-md font-label-md text-primary">{appt.property_title}</p>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full capitalize ${APPOINTMENT_STATUS_STYLES[appt.status] || 'bg-surface-container text-on-surface-variant'}`}>
                              {appt.status}
                            </span>
                          </div>
                          {appt.notes && <p className="text-body-sm font-body-sm text-on-surface-variant">{appt.notes}</p>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </>
  );
}