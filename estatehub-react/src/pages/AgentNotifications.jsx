// src/pages/AgentNotifications.jsx
// The agent's notifications from the EXISTING notification system (GET /notifications,
// PUT /notifications/:id/read, PUT /notifications/read-all). Nothing is generated client-side.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AgentLayout from '../components/agent/AgentLayout';
import useAsyncData from '../hooks/useAsyncData';
import { listNotifications, markNotificationRead, markAllNotificationsRead } from '../api/notifications';
import { Card, DataState, Icon, btnOutline, useToast } from '../components/agent/agentUi';
import { timeAgo } from '../components/agent/agentUtils';
import { NOTIFICATION_ICONS, notificationTarget } from '../components/agent/notificationLinks';

export default function AgentNotifications() {
  const navigate = useNavigate();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const { toast, show } = useToast();

  const notifications = useAsyncData(() => listNotifications({ limit: 50, unreadOnly }), [unreadOnly]);
  const list = notifications.data?.notifications || [];
  const unread = Number(notifications.data?.unreadCount) || 0;

  const open = async (n) => {
    const target = notificationTarget(n);
    if (!n.is_read) {
      try {
        await markNotificationRead(n.notification_id);
      } catch (err) {
        show('error', err.message || 'Could not mark it as read.');
        return;
      }
    }
    if (target) navigate(target);
    else notifications.reload({ silent: true });
  };

  const markAll = async () => {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      show('success', 'All notifications marked as read.');
    } catch (err) {
      show('error', err.message || 'Could not mark notifications as read.');
    } finally {
      setMarkingAll(false);
      notifications.reload({ silent: true });
    }
  };

  return (
    <AgentLayout
      active="notifications"
      title="Notifications"
      subtitle="Updates about your listings, viewings, verification and license."
      actions={unread > 0 ? <button type="button" className={btnOutline} disabled={markingAll} onClick={markAll}>{markingAll ? 'Marking…' : 'Mark all as read'}</button> : null}
    >
      <div role="tablist" aria-label="Filter notifications" className="flex gap-2 mb-5">
        {[[false, 'All'], [true, 'Unread']].map(([value, label]) => {
          const selected = unreadOnly === value;
          return (
            <button key={label} type="button" role="tab" aria-selected={selected} onClick={() => setUnreadOnly(value)}
              className={`min-h-[44px] px-4 rounded-full text-label-md font-label-md border transition-colors ${selected ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container-lowest text-on-surface-variant border-border-subtle hover:bg-surface-container-low'}`}>
              {label}
              {value && unread > 0 && <span className={`ml-2 text-[11px] px-1.5 py-0.5 rounded-full ${selected ? 'bg-on-primary/20' : 'bg-surface-container'}`}>{unread}</span>}
            </button>
          );
        })}
      </div>

      <DataState
        loading={notifications.loading}
        error={notifications.error}
        onRetry={() => notifications.reload()}
        empty={list.length === 0}
        rows={4}
        emptyProps={unreadOnly ? { icon: 'done_all', title: 'You’re all caught up', children: 'No unread notifications.' } : { icon: 'notifications_none', title: 'No notifications yet', children: 'Updates about your listings, viewings, messages and verification will appear here.' }}
      >
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border-subtle" aria-label="Notifications">
            {list.map((n) => (
              <li key={n.notification_id} data-notification-id={n.notification_id} data-read={n.is_read ? 'true' : 'false'}>
                <button type="button" onClick={() => open(n)} className="w-full text-left flex items-start gap-4 px-5 py-4 min-h-[64px] hover:bg-surface-container-low transition-colors">
                  <div className="w-10 h-10 rounded-full bg-surface-container-low flex items-center justify-center text-primary flex-shrink-0 relative">
                    <Icon name={NOTIFICATION_ICONS[n.type] || 'notifications'} />
                    {!n.is_read && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-primary border-2 border-surface-container-lowest" aria-label="Unread" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-body-md font-body-md text-primary ${n.is_read ? '' : 'font-semibold'}`}>{n.title}</p>
                    {n.body && <p className="text-body-sm font-body-sm text-on-surface-variant break-words">{n.body}</p>}
                  </div>
                  <span className="text-label-sm font-label-sm text-on-surface-variant whitespace-nowrap">{timeAgo(n.created_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </DataState>
      {toast}
    </AgentLayout>
  );
}
