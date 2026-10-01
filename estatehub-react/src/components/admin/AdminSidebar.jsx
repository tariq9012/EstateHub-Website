// src/components/admin/AdminSidebar.jsx
// Admin navigation: fixed sidebar on desktop, reused inside the mobile drawer (see AdminLayout).
// Mirrors AgentSidebar's structure/look (active item = secondary container).

import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ADMIN_NAV } from './adminNav';
import { Icon } from '../agent/agentUi';
import { fullName } from '../agent/agentUtils';
import { PERMISSION_LABELS } from './adminUtils';

const IDLE = 'flex items-center gap-3 text-on-surface-variant px-4 py-3 min-h-[44px] hover:bg-surface-container-high transition-all rounded-lg';
const ACTIVE = 'flex items-center gap-3 bg-secondary-container text-on-secondary-container rounded-lg px-4 py-3 min-h-[44px] font-semibold';

const BADGE_FOR = { properties: 'properties', verification: 'verification', renewals: 'renewals' };

export function AdminNavList({ active, badges = {}, onNavigate }) {
  return (
    <nav aria-label="Admin navigation" className="flex-1 flex flex-col gap-1 overflow-y-auto">
      {ADMIN_NAV.map((item) => {
        const isActive = item.key === active;
        const count = badges[BADGE_FOR[item.key]] || 0;
        return (
          <Link key={item.key} to={item.to} className={isActive ? ACTIVE : IDLE} aria-current={isActive ? 'page' : undefined} onClick={onNavigate}>
            <Icon name={item.icon} />
            <span className="text-label-md font-label-md">{item.label}</span>
            {count > 0 && (
              <span className="ml-auto bg-primary text-on-primary text-[10px] px-1.5 py-0.5 rounded-full" aria-label={`${count} pending`}>
                {count > 99 ? '99+' : count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminBrand() {
  const { user } = useAuth();
  const name = fullName(user?.first_name, user?.last_name, 'Admin');
  const permissionLabel = PERMISSION_LABELS[user?.adminProfile?.permission_level] || 'Admin';
  return (
    <div className="mb-6 px-4 pt-2">
      <div className="text-headline-md font-headline-md font-black text-primary">EstateHub</div>
      <div className="text-label-sm font-label-sm text-on-surface-variant mt-1 truncate" title={name}>
        {name} · {permissionLabel}
      </div>
    </div>
  );
}

export default function AdminSidebar({ active, badges }) {
  const { logout } = useAuth();
  return (
    <aside className="hidden md:flex fixed left-0 top-0 h-full w-64 flex-col p-4 z-40 bg-surface border-r border-border-subtle shadow-xl">
      <AdminBrand />
      <AdminNavList active={active} badges={badges} />
      <div className="mt-4 pt-4 border-t border-border-subtle">
        <button
          type="button"
          onClick={logout}
          className="flex items-center justify-center gap-2 min-h-[44px] w-full border border-border-subtle text-primary rounded-lg text-label-md font-label-md hover:bg-surface-container-low transition-colors"
        >
          <Icon name="logout" className="text-[18px]" />
          Log out
        </button>
      </div>
    </aside>
  );
}
