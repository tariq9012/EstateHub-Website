// src/components/admin/DocumentPreviewModal.jsx
// Securely previews a verification/license-renewal document. Documents are never on the public
// /uploads mount (see backend app.js) — this fetches the bytes through the authenticated
// GET /api/verification/documents/:documentId/file route and renders them from a blob: URL.

import { useEffect, useRef, useState } from 'react';
import { getDocumentFileUrl } from '../../api/verification';
import { Icon, btnOutline, LoadingBlock, ErrorBox } from '../agent/agentUi';
import { DOCUMENT_TYPE_LABELS } from '../agent/agentUtils';

export default function DocumentPreviewModal({ documentId, documentType, onClose }) {
  const [state, setState] = useState({ loading: true, error: null, url: null, contentType: null });
  const closeRef = useRef(null);
  const urlRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, url: null, contentType: null });
    getDocumentFileUrl(documentId)
      .then(({ url, contentType }) => {
        if (cancelled) { URL.revokeObjectURL(url); return; }
        urlRef.current = url;
        setState({ loading: false, error: null, url, contentType });
      })
      .catch((err) => {
        if (!cancelled) setState({ loading: false, error: err.message || 'Could not load this document.', url: null, contentType: null });
      });
    return () => {
      cancelled = true;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [documentId]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isImage = state.contentType?.startsWith('image/');
  const isPdf = state.contentType === 'application/pdf';

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Document preview">
      <button type="button" aria-label="Close preview" tabIndex={-1} className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-4 md:inset-10 bg-surface rounded-2xl shadow-xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <h2 className="text-headline-md font-headline-md text-primary">
            {DOCUMENT_TYPE_LABELS[documentType] || 'Document'}
          </h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-surface-container-high">
            <Icon name="close" />
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-surface-container-low flex items-center justify-center p-4">
          {state.loading && <LoadingBlock rows={4} label="Loading document" />}
          {state.error && <ErrorBox message={state.error} />}
          {!state.loading && !state.error && state.url && (
            isImage ? (
              <img src={state.url} alt="Submitted document" className="max-w-full max-h-full object-contain rounded-lg shadow" />
            ) : isPdf ? (
              <iframe title="Submitted document" src={state.url} className="w-full h-full rounded-lg bg-white" />
            ) : (
              <div className="text-center">
                <Icon name="description" className="text-[40px] text-on-surface-variant" />
                <p className="mt-2 text-body-sm font-body-sm text-on-surface-variant">
                  Preview isn't available for this file type.
                </p>
                <a href={state.url} download className={`${btnOutline} mt-4 inline-flex`}>
                  <Icon name="download" className="text-[18px]" /> Download to view
                </a>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
