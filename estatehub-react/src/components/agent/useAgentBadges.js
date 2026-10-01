// src/components/agent/useAgentBadges.js
// Unread counters for the Agent navigation (notifications + messages), refreshed while the tab is visible.

import { useCallback, useEffect, useState } from 'react';
import { listNotifications } from '../../api/notifications';
import { listConversations } from '../../api/conversations';

const REFRESH_MS = 60000;

export default function useAgentBadges() {
  const [badges, setBadges] = useState({ messages: 0, notifications: 0 });

  const load = useCallback(async () => {
    const [notes, convs] = await Promise.allSettled([listNotifications({ unreadOnly: true, limit: 1 }), listConversations()]);
    setBadges((prev) => ({
      notifications: notes.status === 'fulfilled' ? Number(notes.value?.unreadCount) || 0 : prev.notifications,
      messages:
        convs.status === 'fulfilled' ? (convs.value?.conversations || []).reduce((sum, c) => sum + (Number(c.unread_count) || 0), 0) : prev.messages,
    }));
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  return badges;
}
