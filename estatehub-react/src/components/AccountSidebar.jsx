// src/components/AccountSidebar.jsx
// Desktop sidebar shared by the signed-in account pages (Messages, Appointments).
// Visually identical to the UserDashboard sidebar; the dashboard keeps its own inline copy.

import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AgentSidebar from './agent/AgentSidebar';
import useAgentBadges from './agent/useAgentBadges';
import { AGENT_HOME } from './agent/agentNav';

const HOME_BY_ROLE = { buyer: '/user-dashboard', agent: AGENT_HOME, admin: '/admin-dashboard' };

export function homePathForRole(role) {
  return HOME_BY_ROLE[role] || '/user-dashboard';
}

const IDLE = 'flex items-center gap-3 text-on-surface-variant dark:text-on-primary-container px-4 py-3 hover:bg-surface-container-high dark:hover:bg-surface-variant transition-all rounded-lg';
const ACTIVE = 'flex items-center gap-3 px-4 py-3 rounded-lg bg-surface-container-high text-primary';

// Agents see their own portal navigation on the shared Messages / Appointments pages.
function AgentAccountSidebar({ active }) {
  const badges = useAgentBadges();
  return <AgentSidebar active={active} badges={badges} />;
}

export default function AccountSidebar({ active, unreadMessages = 0 }) {
  const { user } = useAuth();
  if (user?.role === 'agent') return <AgentAccountSidebar active={active} />;
  const item = (key, to, icon, label, badge) => (
    <Link className={active === key ? ACTIVE : IDLE} to={to} aria-current={active === key ? 'page' : undefined}>
      <span aria-hidden="true" className="material-symbols-outlined">{icon}</span>
      <span className="text-label-md font-label-md">{label}</span>
      {badge > 0 && <span className="ml-auto bg-primary text-on-primary text-[10px] px-1.5 py-0.5 rounded-full">{badge > 99 ? '99+' : badge}</span>}
    </Link>
  );

  return (
    <aside className="bg-surface dark:bg-primary-container border-r border-border-subtle dark:border-outline-variant shadow-xl dark:shadow-none fixed left-0 top-0 h-full flex-col p-4 z-40 hidden md:flex w-64">
      <div className="mb-8 pl-4 pt-4">
        <div className="text-headline-md font-headline-md font-black text-primary dark:text-on-primary">EstateHub</div>
        <div className="text-label-sm font-label-sm text-on-surface-variant mt-1">Premium Real Estate</div>
      </div>
      <nav className="flex-1 flex flex-col gap-2">
        {item('home', homePathForRole(user?.role), 'home', 'Overview')}
        {item('browse', '/browse-properties', 'search', 'Browse Properties')}
        {item('appointments', '/appointments', 'calendar_month', 'Appointments')}
        {item('messages', '/messages', 'mail', 'Messages', unreadMessages)}
      </nav>
      <div className="mt-8 pt-4 border-t border-border-subtle">
        <Link className="w-full bg-primary text-on-primary text-label-md font-label-md py-3 rounded-lg hover:opacity-90 transition-opacity block text-center" to="/list-your-property">
          List Your Property
        </Link>
      </div>
    </aside>
  );
}
