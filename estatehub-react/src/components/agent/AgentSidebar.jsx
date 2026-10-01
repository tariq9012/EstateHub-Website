// src/components/agent/AgentSidebar.jsx
// Agent navigation: fixed sidebar on desktop, reused inside the mobile drawer (see AgentLayout).
// Look matches the EstateHub sidebars (active item = secondary container, CTA at the bottom).

import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { AGENT_NAV } from './agentNav';
import { Icon } from './agentUi';
import { fullName } from './agentUtils';

const IDLE = 'flex items-center gap-3 text-on-surface-variant px-4 py-3 min-h-[44px] hover:bg-surface-container-high transition-all rounded-lg';
const ACTIVE = 'flex items-center gap-3 bg-secondary-container text-on-secondary-container rounded-lg px-4 py-3 min-h-[44px] font-semibold';

const BADGE_FOR = { messages: 'messages', notifications: 'notifications' };

export function AgentNavList({ active, badges = {}, onNavigate }) {
  return (
    <nav aria-label="Agent navigation" className="flex-1 flex flex-col gap-1 overflow-y-auto">
      {AGENT_NAV.map((item) => {
        const isActive = item.key === active;
        const count = badges[BADGE_FOR[item.key]] || 0;
        return (
          <Link key={item.key} to={item.to} className={isActive ? ACTIVE : IDLE} aria-current={isActive ? 'page' : undefined} onClick={onNavigate}>
            <Icon name={item.icon} />
            <span className="text-label-md font-label-md">{item.label}</span>
            {count > 0 && (
              <span className="ml-auto bg-primary text-on-primary text-[10px] px-1.5 py-0.5 rounded-full" aria-label={`${count} unread`}>
                {count > 99 ? '99+' : count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function AgentBrand() {
  const { user } = useAuth();
  const name = fullName(user?.first_name, user?.last_name, 'Agent');
  return (
    <div className="mb-6 px-4 pt-2">
      <div className="text-headline-md font-headline-md font-black text-primary">EstateHub</div>
      <div className="text-label-sm font-label-sm text-on-surface-variant mt-1 truncate" title={name}>
        {name} · Agent
      </div>
    </div>
  );
}

export default function AgentSidebar({ active, badges }) {
  return (
    <aside className="hidden md:flex fixed left-0 top-0 h-full w-64 flex-col p-4 z-40 bg-surface border-r border-border-subtle shadow-xl">
      <AgentBrand />
      <AgentNavList active={active} badges={badges} />
      <div className="mt-4 pt-4 border-t border-border-subtle">
        <Link to="/agent-profile" className="flex items-center justify-center gap-2 min-h-[44px] w-full border border-border-subtle text-primary rounded-lg text-label-md font-label-md hover:bg-surface-container-low transition-colors">
          <Icon name="badge" className="text-[18px]" />
          View public profile
        </Link>
      </div>
    </aside>
  );
}
