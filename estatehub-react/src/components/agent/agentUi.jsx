// src/components/agent/agentUi.jsx
// Small presentational pieces shared by the Agent portal pages (kept in the EstateHub design system).

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toneClass } from './agentUtils';

export const btnPrimary =
  'inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-lg bg-primary text-on-primary text-label-md font-label-md hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed';
export const btnOutline =
  'inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-lg border border-border-subtle text-primary text-label-md font-label-md hover:bg-surface-container-low transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
export const btnDanger =
  'inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-lg border border-error text-error text-label-md font-label-md hover:bg-error-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
export const inputClass =
  'w-full px-4 py-3 bg-surface-container-lowest border border-border-subtle rounded-lg text-body-md font-body-md text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors disabled:opacity-60';
export const labelClass = 'block text-label-md font-label-md text-on-surface-variant mb-2';

export function Icon({ name, className = '' }) {
  return (
    <span aria-hidden="true" className={`material-symbols-outlined ${className}`}>
      {name}
    </span>
  );
}

export function Card({ className = '', children, ...rest }) {
  return (
    <div className={`bg-surface-container-lowest border border-border-subtle rounded-2xl ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function SectionHeader({ title, action }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <h2 className="text-headline-md font-headline-md text-primary">{title}</h2>
      {action}
    </div>
  );
}

export function StatusBadge({ meta, fallback = '' }) {
  const info = meta || { label: fallback, tone: 'neutral' };
  return <span className={`inline-block text-label-sm font-label-sm px-3 py-1 rounded-full whitespace-nowrap ${toneClass(info.tone)}`}>{info.label}</span>;
}

export function StatCard({ icon, label, value, hint, to, tone }) {
  const body = (
    <>
      <div className="flex items-center justify-between mb-3">
        <span className="text-label-md font-label-md text-on-surface-variant">{label}</span>
        <Icon name={icon} className={`text-[22px] ${tone === 'error' ? 'text-error' : 'text-on-surface-variant'}`} />
      </div>
      <p className="text-headline-lg font-headline-lg text-primary leading-none">{value}</p>
      {hint && <p className="mt-2 text-label-sm font-label-sm text-on-surface-variant">{hint}</p>}
    </>
  );
  const cls = 'block bg-surface-container-lowest border border-border-subtle rounded-2xl p-5';
  return to ? (
    <Link to={to} className={`${cls} hover:border-primary transition-colors`} data-stat={label}>
      {body}
    </Link>
  ) : (
    <div className={cls} data-stat={label}>
      {body}
    </div>
  );
}

export function LoadingBlock({ rows = 3, label = 'Loading' }) {
  return (
    <div className="space-y-3 animate-pulse" role="status" aria-label={label}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-16 rounded-xl bg-surface-container" />
      ))}
    </div>
  );
}

export function ErrorBox({ message, onRetry, compact = false }) {
  return (
    <div className={`text-center ${compact ? 'py-6' : 'py-10'}`} role="alert">
      <div className="mx-auto mb-3 w-11 h-11 rounded-full bg-error-container flex items-center justify-center text-on-error-container">
        <Icon name="error" />
      </div>
      <p className="text-body-sm font-body-sm text-on-surface-variant mb-4 max-w-sm mx-auto">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className={btnPrimary}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyBox({ icon = 'inbox', title, children, action, compact = false }) {
  return (
    <div className={`text-center ${compact ? 'py-6' : 'py-12'} px-4`}>
      <div className="mx-auto mb-3 w-11 h-11 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant">
        <Icon name={icon} />
      </div>
      <p className="text-label-md font-label-md text-primary mb-1">{title}</p>
      {children && <p className="text-body-sm font-body-sm text-on-surface-variant max-w-sm mx-auto">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Renders loading / error / empty / content for a useAsyncData result. */
export function DataState({ loading, error, onRetry, empty, emptyProps, rows, compact, children }) {
  if (loading) return <LoadingBlock rows={rows} />;
  if (error) return <ErrorBox message={error} onRetry={onRetry} compact={compact} />;
  if (empty) return <EmptyBox compact={compact} {...emptyProps} />;
  return children;
}

/** Toast state + element. `const { toast, show } = useToast()` then render {toast}. Errors stay until dismissed. */
export function useToast() {
  const [state, setState] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const show = useCallback((type, message) => {
    clearTimeout(timer.current);
    setState({ type, message });
    if (type === 'success') timer.current = setTimeout(() => setState(null), 5000);
  }, []);
  const dismiss = useCallback(() => setState(null), []);
  const toast = state && (
    <div className="fixed bottom-4 inset-x-4 md:inset-x-auto md:right-6 md:w-96 z-[60]">
      <div
        role={state.type === 'error' ? 'alert' : 'status'}
        className={`flex items-start gap-3 rounded-xl border p-4 shadow-lg ${
          state.type === 'error' ? 'bg-error-container text-on-error-container border-error/30' : 'bg-surface-container-lowest text-primary border-border-subtle'
        }`}
      >
        <Icon name={state.type === 'error' ? 'error' : 'check_circle'} className="text-[20px] flex-shrink-0" />
        <p className="flex-1 text-body-sm font-body-sm">{state.message}</p>
        <button type="button" onClick={dismiss} aria-label="Dismiss message" className="-m-2 p-2 rounded-full hover:bg-black/5">
          <Icon name="close" className="text-[18px]" />
        </button>
      </div>
    </div>
  );
  return { toast, show, dismiss };
}
