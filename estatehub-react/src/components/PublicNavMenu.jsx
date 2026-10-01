// src/components/PublicNavMenu.jsx
// Hamburger menu for the public pages' header on small screens. The desktop nav on those pages is
// `hidden md:flex` (or lg), so without this control phones had no navigation or Sign In link.
// Accessible: a real <button> with aria-expanded/aria-controls, Escape closes and returns focus to
// the button, focus moves into the panel on open, and route changes close it.

import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { homePathForRole } from './AccountSidebar';

// Tailwind needs full class names at build time, so the breakpoint is a lookup, not a template.
const HIDE_AT = { md: 'md:hidden', lg: 'lg:hidden' };

const LINKS = [
  { to: '/browse-properties?listingType=sale', label: 'Buy' },
  { to: '/browse-properties?listingType=rent', label: 'Rent' },
  { to: '/find-an-agent', label: 'Agents' },
  { to: '/browse-properties', label: 'Explore' },
];

const ITEM = 'block px-4 py-3 rounded-lg text-label-md font-label-md text-on-surface hover:bg-surface-container-high focus:outline-none focus:ring-2 focus:ring-primary';

export default function PublicNavMenu({ breakpoint = 'md' }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const location = useLocation();
  const { user, logout } = useAuth();
  const canList = user && (user.role === 'agent' || user.role === 'admin');

  // Close on navigation.
  useEffect(() => { setOpen(false); }, [location.pathname, location.search]);

  useEffect(() => {
    if (!open) return undefined;
    const first = panelRef.current?.querySelector('a,button');
    first?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className={`relative ${HIDE_AT[breakpoint] || HIDE_AT.md}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        aria-controls="public-nav-panel"
        onClick={() => setOpen((v) => !v)}
        className="p-2 rounded-lg text-primary hover:bg-surface-container-high focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <span className="material-symbols-outlined" aria-hidden="true">{open ? 'close' : 'menu'}</span>
      </button>
      {open && (
        <nav
          id="public-nav-panel"
          ref={panelRef}
          aria-label="Main"
          className="absolute right-0 top-full mt-2 w-64 max-w-[calc(100vw-2rem)] bg-surface-container-lowest border border-border-subtle rounded-xl shadow-xl p-2 z-50"
        >
          {LINKS.map((l) => (
            <Link key={l.label} to={l.to} className={ITEM}>{l.label}</Link>
          ))}
          {canList && <Link to="/list-your-property" className={ITEM}>List Your Property</Link>}
          <hr className="my-2 border-border-subtle" />
          {user ? (
            <>
              <Link to={homePathForRole(user.role)} className={ITEM}>My dashboard</Link>
              <button
                type="button"
                className={`${ITEM} w-full text-left`}
                onClick={async () => { setOpen(false); await logout(); }}
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link to="/sign-in" className={ITEM}>Sign In</Link>
              <Link to="/register" className={ITEM}>Create account</Link>
            </>
          )}
        </nav>
      )}
    </div>
  );
}
