// src/pages/NotificationSettings.jsx
// Real system_notification_settings toggles — rendered from whatever rows exist in the
// database (seeded ones today), not a hardcoded list. Persists via PUT .../:eventKey.
// Only a super_admin can change these (see backend requirePermission.js) — moderators/support
// see the current settings read-only.

import { useState } from 'react';
import AdminLayout from '../components/admin/AdminLayout';
import useAsyncData from '../hooks/useAsyncData';
import { getNotificationSettings, updateNotificationSetting } from '../api/admin';
import { useAuth } from '../context/AuthContext';
import { Card, DataState, Icon, useToast } from '../components/agent/agentUi';
import { formatTimestamp } from '../components/agent/agentUtils';
import { formatActionType } from '../components/admin/adminUtils';

function Toggle({ checked, disabled, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        checked ? 'bg-primary' : 'bg-surface-container-high'
      }`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

export default function NotificationSettings() {
  const { user } = useAuth();
  const isSuperAdmin = user?.adminProfile?.permission_level === 'super_admin';
  const { data, loading, error, reload } = useAsyncData(() => getNotificationSettings());
  const [savingKey, setSavingKey] = useState(null);
  const { toast, show } = useToast();

  const toggle = async (setting, field, value) => {
    setSavingKey(`${setting.event_key}:${field}`);
    try {
      await updateNotificationSetting(setting.event_key, { [field]: value });
      show('success', 'Setting saved.');
      reload({ silent: true });
    } catch (err) {
      show('error', err.message || 'Could not save this setting.');
    } finally {
      setSavingKey(null);
    }
  };

  const settings = data?.settings || [];

  return (
    <AdminLayout active="settings" title="Notification Settings" subtitle="Controls which system events send email or SMS notifications.">
      {!isSuperAdmin && (
        <div className="mb-6 rounded-xl bg-secondary-container text-on-secondary-container px-4 py-3 text-body-sm font-body-sm flex items-center gap-2">
          <Icon name="info" className="text-[18px]" />
          Only a super admin can change these settings. You can view the current configuration below.
        </div>
      )}

      <DataState
        loading={loading}
        error={error}
        onRetry={reload}
        empty={!loading && !error && settings.length === 0}
        emptyProps={{ icon: 'notifications_off', title: 'No notification event types configured yet' }}
      >
        <Card className="divide-y divide-border-subtle overflow-hidden">
          {settings.map((s) => (
            <div key={s.event_key} className="flex flex-col sm:flex-row sm:items-center gap-4 px-5 py-4">
              <div className="flex-1 min-w-0">
                <p className="text-label-md font-label-md text-primary">{formatActionType(s.event_key)}</p>
                {s.description && <p className="text-body-sm font-body-sm text-on-surface-variant mt-1">{s.description}</p>}
                {s.updated_at && <p className="text-label-sm font-label-sm text-on-surface-variant mt-1">Last updated {formatTimestamp(s.updated_at)}</p>}
              </div>
              <div className="flex items-center gap-6 flex-shrink-0">
                <label className="flex items-center gap-2">
                  <span className="text-label-sm font-label-sm text-on-surface-variant">Email</span>
                  <Toggle
                    checked={!!s.email_enabled}
                    disabled={!isSuperAdmin || savingKey === `${s.event_key}:emailEnabled`}
                    onChange={(v) => toggle(s, 'emailEnabled', v)}
                    label={`Email notifications for ${formatActionType(s.event_key)}`}
                  />
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-label-sm font-label-sm text-on-surface-variant">SMS</span>
                  <Toggle
                    checked={!!s.sms_enabled}
                    disabled={!isSuperAdmin || savingKey === `${s.event_key}:smsEnabled`}
                    onChange={(v) => toggle(s, 'smsEnabled', v)}
                    label={`SMS notifications for ${formatActionType(s.event_key)}`}
                  />
                </label>
              </div>
            </div>
          ))}
        </Card>
      </DataState>
      {toast}
    </AdminLayout>
  );
}
