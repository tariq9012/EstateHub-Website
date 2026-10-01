// src/components/appointments/AppointmentCard.jsx
// One viewing. Stacks on mobile (image on top, full-width touch-sized buttons) and goes
// horizontal on md+. Actions come ONLY from `appt.available_actions` (server-decided).

import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ACTION_META,
  ACTION_ORDER,
  STATUS_META,
  actionLabel,
  confirmCopy,
  formatDuration,
  formatLongDate,
  formatTimeRange,
  fullName,
  getStart,
  isOverdue,
  needsConfirmation,
  propertyLocation,
  timezoneLabel,
} from './appointmentUtils';

const BTN = 'min-h-[44px] min-w-[8.5rem] sm:min-w-0 whitespace-nowrap px-4 rounded-lg text-label-md font-label-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 flex-1 sm:flex-none';
const BTN_PRIMARY = `${BTN} bg-primary text-on-primary hover:opacity-90`;
const BTN_OUTLINE = `${BTN} border border-border-subtle text-primary hover:bg-surface-container-low`;
const BTN_DANGER = `${BTN} border border-error text-error hover:bg-error-container`;

function Detail({ icon, label, children }) {
  return (
    <div className="flex items-start gap-3 min-w-0">
      <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-on-surface-variant mt-0.5 flex-shrink-0">{icon}</span>
      <div className="min-w-0">
        <dt className="text-label-sm font-label-sm text-on-surface-variant">{label}</dt>
        <dd className="text-body-sm font-body-sm text-primary break-words">{children}</dd>
      </div>
    </div>
  );
}

export default function AppointmentCard({ appointment: appt, mode, busy, onAction }) {
  const [confirming, setConfirming] = useState(null); // target status awaiting "are you sure?"
  const [pending, setPending] = useState(null); // target currently being saved (only that button shows its busy label)
  const start = getStart(appt);
  const status = STATUS_META[appt.status] || { label: appt.status, className: 'bg-surface-container text-on-surface-variant' };
  const location = propertyLocation(appt);
  const agentMode = mode === 'agent';
  const otherName = agentMode ? fullName(appt.buyer_first_name || appt.first_name, appt.buyer_last_name || appt.last_name, 'Buyer') : fullName(appt.agent_first_name, appt.agent_last_name, 'Agent');
  const otherLabel = agentMode ? 'Buyer' : 'Agent';
  const actions = ACTION_ORDER.filter((t) => (appt.available_actions || []).includes(t));
  const overdue = isOverdue(appt);
  const titleId = `appt-title-${appt.appointment_id}`;

  const run = async (target) => {
    setConfirming(null);
    setPending(target);
    try {
      await onAction(appt, target);
    } finally {
      setPending(null);
    }
  };

  const onClickAction = (target) => {
    if (needsConfirmation(target)) setConfirming(target);
    else run(target);
  };

  const copy = confirming ? confirmCopy(confirming, mode) : null;

  return (
    <article aria-labelledby={titleId} className="bg-surface-container-lowest border border-border-subtle rounded-2xl overflow-hidden flex flex-col md:flex-row" data-appointment-id={appt.appointment_id} data-status={appt.status}>
      <Link to={`/property-details/${appt.property_id}`} className="block md:w-56 lg:w-64 flex-shrink-0 h-44 md:h-auto md:min-h-[200px] bg-surface-container relative" aria-label={`View ${appt.property_title}`} tabIndex={-1}>
        {appt.property_image_url ? (
          <img className="absolute inset-0 w-full h-full object-cover" src={appt.property_image_url} alt="" loading="lazy" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-on-surface-variant">
            <span aria-hidden="true" className="material-symbols-outlined text-[40px]">home</span>
          </span>
        )}
      </Link>

      <div className="flex-1 min-w-0 p-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1 basis-48">
            <h3 id={titleId} className="text-body-md font-body-md font-semibold text-primary break-words">
              <Link to={`/property-details/${appt.property_id}`} className="hover:underline">{appt.property_title}</Link>
            </h3>
            {location && (
              <p className="mt-0.5 flex items-center gap-1 text-body-sm font-body-sm text-on-surface-variant">
                <span aria-hidden="true" className="material-symbols-outlined text-[16px] flex-shrink-0">location_on</span>
                <span className="break-words min-w-0">{location}</span>
              </p>
            )}
          </div>
          <span className={`text-label-sm font-label-sm px-3 py-1 rounded-full whitespace-nowrap ${status.className}`}>{status.label}</span>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          <Detail icon="event" label="Date">{start ? formatLongDate(start) : '—'}</Detail>
          <Detail icon="schedule" label="Time">
            {formatTimeRange(appt)} <span className="text-on-surface-variant">({formatDuration(appt.duration_minutes)}{start ? `, ${timezoneLabel(start)}` : ''})</span>
          </Detail>
          <Detail icon="person" label={otherLabel}>
            {otherName}
            {agentMode && appt.email && <span className="block text-on-surface-variant break-all">{appt.email}</span>}
            {!agentMode && appt.agent_agency_name && <span className="block text-on-surface-variant">{appt.agent_agency_name}</span>}
          </Detail>
        </dl>

        {appt.notes && (
          <div className="bg-surface-container-low border border-border-subtle rounded-lg p-3">
            <p className="text-label-sm font-label-sm text-on-surface-variant mb-1">Notes</p>
            <p className="text-body-sm font-body-sm text-primary whitespace-pre-wrap break-words">{appt.notes}</p>
          </div>
        )}

        {overdue && (
          <p className="text-body-sm font-body-sm text-on-surface-variant bg-surface-container-low border border-border-subtle rounded-lg p-3" role="note">
            {agentMode
              ? 'The scheduled time has passed. Mark this viewing as completed or a no-show, or cancel the request.'
              : 'The scheduled time has passed and the agent has not updated this viewing yet.'}
          </p>
        )}

        {confirming ? (
          <div role="group" aria-label="Confirm action" className="bg-error-container/40 border border-error/30 rounded-lg p-4">
            <p className="text-label-md font-label-md text-primary">{copy.question}</p>
            <p className="text-body-sm font-body-sm text-on-surface-variant mt-1">{copy.detail}</p>
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <button type="button" className={BTN_OUTLINE} onClick={() => setConfirming(null)} disabled={busy}>{copy.no}</button>
              <button type="button" className={BTN_DANGER} onClick={() => run(confirming)} disabled={busy}>{copy.yes}</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 mt-auto">
            {actions.map((target, index) => {
              const danger = target === 'cancelled' || target === 'no_show';
              const primary = !danger && index === 0;
              return (
                <button key={target} type="button" onClick={() => onClickAction(target)} disabled={busy} className={danger ? BTN_DANGER : primary ? BTN_PRIMARY : BTN_OUTLINE} data-action={target}>
                  {busy && pending === target ? ACTION_META[target].busy : actionLabel(target, mode, appt)}
                </button>
              );
            })}
            <Link to={`/property-details/${appt.property_id}`} className={BTN_OUTLINE}>
              View Property
            </Link>
            {appt.conversation_id && (
              <Link to={`/messages?conversation=${appt.conversation_id}`} className={BTN_OUTLINE}>
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">mail</span>
                {agentMode ? 'Message buyer' : 'Message agent'}
              </Link>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
