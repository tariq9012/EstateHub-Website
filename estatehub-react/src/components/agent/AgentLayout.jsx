// src/components/agent/AgentLayout.jsx
// Shared shell for every Agent portal page: desktop sidebar, mobile top bar + slide-in drawer, page header.

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import AgentSidebar, { AgentBrand, AgentNavList } from './AgentSidebar';
import useAgentBadges from './useAgentBadges';
import { Icon } from './agentUi';

export default function AgentLayout({ active, title, subtitle, actions, children, wide = false }) {
  const badges = useAgentBadges();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeRef = useRef(null);
  const menuButtonRef = useRef(null);
  const unreadTotal = badges.messages + badges.notifications;

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    closeRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const closeMenu = () => {
    setMenuOpen(false);
    menuButtonRef.current?.focus();
  };

  return (
    <>
      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 inset-x-0 z-50 h-20 px-margin-mobile flex items-center justify-between bg-surface-container-lowest border-b border-border-subtle shadow-sm">
        <div className="min-w-0">
          <div className="text-headline-md font-headline-md font-extrabold tracking-tight text-primary leading-none">EstateHub</div>
          <div className="text-label-sm font-label-sm text-on-surface-variant mt-1 truncate">{title}</div>
        </div>
        <div className="flex items-center gap-1">
          <Link to="/agent-notifications" aria-label={`Notifications${badges.notifications ? `, ${badges.notifications} unread` : ''}`} className="relative min-w-[44px] min-h-[44px] flex items-center justify-center">
            <Icon name="notifications" className="text-primary" />
            {badges.notifications > 0 && <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-error" />}
          </Link>
          <button
            ref={menuButtonRef}
            type="button"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-controls="agent-drawer"
            onClick={() => setMenuOpen(true)}
            className="relative min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <Icon name="menu" className="text-primary" />
            {unreadTotal > 0 && !badges.notifications && <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-primary" />}
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-[70]" id="agent-drawer" role="dialog" aria-modal="true" aria-label="Agent menu">
          <button type="button" aria-label="Close menu" tabIndex={-1} className="absolute inset-0 bg-black/40" onClick={closeMenu} />
          <div className="absolute left-0 top-0 h-full w-[85%] max-w-[320px] bg-surface p-4 flex flex-col shadow-xl">
            <div className="flex items-start justify-between">
              <AgentBrand />
              <button ref={closeRef} type="button" aria-label="Close menu" onClick={closeMenu} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-surface-container-high">
                <Icon name="close" />
              </button>
            </div>
            <AgentNavList active={active} badges={badges} onNavigate={() => setMenuOpen(false)} />
          </div>
        </div>
      )}

      <AgentSidebar active={active} badges={badges} />

      <main className="md:ml-64 pt-24 md:pt-0 min-h-dvh pb-24">
        <div className={`${wide ? 'max-w-[1300px]' : 'max-w-[1100px]'} mx-auto px-margin-mobile md:px-8 lg:px-10`}>
          <div className="md:pt-10 pb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-headline-lg font-headline-lg text-primary">{title}</h1>
              {subtitle && <p className="text-body-md font-body-md text-on-surface-variant mt-2 max-w-2xl">{subtitle}</p>}
            </div>
            {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
          </div>
          {children}
        </div>
      </main>
    </>
  );
}
