// src/components/admin/DocumentRejectionReasonsModal.jsx
// Reusable "reject with reason" modal. Used for document rejection, property rejection, etc. —
// anywhere the backend requires a non-empty reason before it will record a rejection.

import { useRef, useState } from 'react';
import { Icon, btnDanger, btnOutline, inputClass, labelClass } from '../agent/agentUi';

export default function DocumentRejectionReasonsModal({ title = 'Reject with a reason', description, submitting, onCancel, onConfirm }) {
  const [reason, setReason] = useState('');
  const inputRef = useRef(null);

  const trimmed = reason.trim();
  const canSubmit = trimmed.length >= 5 && !submitting;

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" tabIndex={-1} className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[440px] bg-surface rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-headline-md font-headline-md text-primary">{title}</h2>
          <button type="button" onClick={onCancel} aria-label="Close" className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-surface-container-high -mr-2">
            <Icon name="close" />
          </button>
        </div>
        {description && <p className="text-body-sm font-body-sm text-on-surface-variant mb-4">{description}</p>}
        <label htmlFor="rejection-reason" className={labelClass}>Reason (required)</label>
        <textarea
          id="rejection-reason"
          ref={inputRef}
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Explain what needs to change or why this is being rejected…"
          className={inputClass}
          autoFocus
        />
        <p className="text-label-sm font-label-sm text-on-surface-variant mt-1">At least 5 characters.</p>
        <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
          <button type="button" className={btnOutline} onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className={btnDanger} onClick={() => onConfirm(trimmed)} disabled={!canSubmit}>
            {submitting ? 'Submitting…' : 'Confirm rejection'}
          </button>
        </div>
      </div>
    </div>
  );
}
