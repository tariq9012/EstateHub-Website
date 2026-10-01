// src/pages/AgentSettings.jsx
// Profile & settings for the signed-in agent:
//   GET /agents/:id  +  PUT /agents/me/profile         professional profile (agent derived from the JWT)
//   GET/PUT /users/me/notification-preferences         email / SMS / push toggles
// Account name/phone are shown read-only: the existing API has no endpoint to change them.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AgentLayout from '../components/agent/AgentLayout';
import useAsyncData from '../hooks/useAsyncData';
import { getAgent, updateMyAgentProfile } from '../api/agents';
import { getMyNotificationPreferences, updateMyNotificationPreferences } from '../api/users';
import { Card, DataState, btnOutline, btnPrimary, inputClass, labelClass, useToast } from '../components/agent/agentUi';
import { fullName } from '../components/agent/agentUtils';

function ProfileForm({ agent, onSaved }) {
  const [form, setForm] = useState({
    agencyName: agent.agency_name || '',
    specialty: agent.specialty || '',
    yearsExperience: agent.years_experience ?? '',
    companyWebsite: agent.company_website || '',
    officeAddress: agent.office_address || '',
    bio: agent.bio || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (key) => (e) => { setForm((f) => ({ ...f, [key]: e.target.value })); setError(''); };

  const save = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (form.yearsExperience !== '' && (!Number.isInteger(Number(form.yearsExperience)) || Number(form.yearsExperience) < 0)) {
      setError('Years of experience must be a whole number, 0 or more.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await updateMyAgentProfile({
        agencyName: form.agencyName || undefined,
        specialty: form.specialty || undefined,
        yearsExperience: form.yearsExperience === '' ? undefined : Number(form.yearsExperience),
        companyWebsite: form.companyWebsite || undefined,
        officeAddress: form.officeAddress || undefined,
        bio: form.bio || undefined,
      });
      await onSaved('Profile updated.');
    } catch (err) {
      setError(err.message || 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="grid grid-cols-1 md:grid-cols-2 gap-5" noValidate>
      <div>
        <label htmlFor="agencyName" className={labelClass}>Agency</label>
        <input id="agencyName" className={inputClass} value={form.agencyName} onChange={set('agencyName')} maxLength={150} />
      </div>
      <div>
        <label htmlFor="specialty" className={labelClass}>Specialty</label>
        <input id="specialty" className={inputClass} value={form.specialty} onChange={set('specialty')} maxLength={150} placeholder="e.g. Luxury homes" />
      </div>
      <div>
        <label htmlFor="yearsExperience" className={labelClass}>Years of experience</label>
        <input id="yearsExperience" type="number" min="0" step="1" className={inputClass} value={form.yearsExperience} onChange={set('yearsExperience')} />
      </div>
      <div>
        <label htmlFor="companyWebsite" className={labelClass}>Website</label>
        <input id="companyWebsite" type="url" className={inputClass} value={form.companyWebsite} onChange={set('companyWebsite')} placeholder="https://" />
      </div>
      <div className="md:col-span-2">
        <label htmlFor="officeAddress" className={labelClass}>Office address</label>
        <input id="officeAddress" className={inputClass} value={form.officeAddress} onChange={set('officeAddress')} />
      </div>
      <div className="md:col-span-2">
        <label htmlFor="bio" className={labelClass}>About you</label>
        <textarea id="bio" rows={5} className={inputClass} value={form.bio} onChange={set('bio')} maxLength={2000} />
        <p className="mt-1 text-label-sm font-label-sm text-on-surface-variant text-right">{form.bio.length}/2000</p>
      </div>
      {error && <p className="md:col-span-2 text-body-sm font-body-sm text-error" role="alert">{error}</p>}
      <div className="md:col-span-2 flex flex-wrap gap-3">
        <button type="submit" className={btnPrimary} disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
        <Link to="/agent-profile" className={btnOutline}>View public profile</Link>
      </div>
    </form>
  );
}

const PREF_ROWS = [
  ['emailNotifications', 'email_notifications', 'Email notifications', 'Important updates by email.'],
  ['smsNotifications', 'sms_notifications', 'SMS notifications', 'Text messages for time-sensitive updates.'],
  ['pushNotifications', 'push_notifications', 'Push notifications', 'Alerts in your browser or app.'],
];

function Preferences({ prefs, onSaved }) {
  const [values, setValues] = useState(() => Object.fromEntries(PREF_ROWS.map(([camel, snake]) => [camel, Boolean(prefs?.[snake])])));
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState('');

  const toggle = async (camel) => {
    if (saving) return;
    const next = !values[camel];
    setSaving(camel);
    setError('');
    try {
      await updateMyNotificationPreferences({ [camel]: next });
      setValues((v) => ({ ...v, [camel]: next }));
      onSaved('Preferences saved.');
    } catch (err) {
      setError(err.message || 'Could not save that preference.');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div>
      <ul className="divide-y divide-border-subtle">
        {PREF_ROWS.map(([camel, , label, hint]) => (
          <li key={camel} className="py-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-label-md font-label-md text-primary" id={`pref-${camel}`}>{label}</p>
              <p className="text-body-sm font-body-sm text-on-surface-variant">{hint}</p>
            </div>
            <button type="button" role="switch" aria-checked={values[camel]} aria-labelledby={`pref-${camel}`} disabled={saving !== null} onClick={() => toggle(camel)}
              className={`relative w-12 h-7 min-w-[48px] rounded-full transition-colors disabled:opacity-60 ${values[camel] ? 'bg-primary' : 'bg-outline-variant'}`}>
              <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white transition-transform ${values[camel] ? 'translate-x-5' : ''}`} />
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="mt-3 text-body-sm font-body-sm text-error" role="alert">{error}</p>}
    </div>
  );
}

export default function AgentSettings() {
  const { user, refreshMe } = useAuth();
  const agentId = user?.agentProfile?.agent_id;
  const { toast, show } = useToast();

  const profile = useAsyncData(() => (agentId ? getAgent(agentId) : Promise.resolve(null)), [agentId]);
  const prefs = useAsyncData(() => getMyNotificationPreferences());
  const [profileVersion, setProfileVersion] = useState(0);

  const afterProfileSaved = async (message) => {
    await profile.reload({ silent: true });
    setProfileVersion((v) => v + 1);
    refreshMe().catch(() => {}); // keep the cached agent data (agency, rating) in the signed-in user fresh
    show('success', message);
  };

  const agent = profile.data?.agent;

  return (
    <AgentLayout active="settings" title="Profile & Settings" subtitle="How buyers see you, and how we reach you.">
      <div className="space-y-6">
        <Card className="p-6" data-widget="professional-profile">
          <h2 className="text-headline-md font-headline-md text-primary mb-4">Professional profile</h2>
          <DataState loading={profile.loading} error={profile.error || (!agentId && !profile.loading ? 'Your agent profile could not be found.' : '')} onRetry={() => profile.reload()} rows={3}>
            {agent && <ProfileForm key={profileVersion} agent={agent} onSaved={afterProfileSaved} />}
          </DataState>
        </Card>

        <Card className="p-6" data-widget="account">
          <h2 className="text-headline-md font-headline-md text-primary mb-4">Account</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div><dt className="text-label-sm font-label-sm text-on-surface-variant">Name</dt><dd className="text-body-md font-body-md text-primary">{fullName(user?.first_name, user?.last_name, '—')}</dd></div>
            <div><dt className="text-label-sm font-label-sm text-on-surface-variant">Email</dt><dd className="text-body-md font-body-md text-primary break-all">{user?.email || '—'}</dd></div>
            <div><dt className="text-label-sm font-label-sm text-on-surface-variant">Phone</dt><dd className="text-body-md font-body-md text-primary">{user?.phone || '—'}</dd></div>
          </dl>
          <p className="mt-4 text-label-sm font-label-sm text-on-surface-variant">Name, email and phone can’t be changed here yet.</p>
        </Card>

        <Card className="p-6" data-widget="preferences">
          <h2 className="text-headline-md font-headline-md text-primary mb-2">Notification preferences</h2>
          <DataState loading={prefs.loading} error={prefs.error} onRetry={() => prefs.reload()} rows={3}>
            {prefs.data && <Preferences prefs={prefs.data.preferences} onSaved={(m) => show('success', m)} />}
          </DataState>
        </Card>
      </div>
      {toast}
    </AgentLayout>
  );
}
