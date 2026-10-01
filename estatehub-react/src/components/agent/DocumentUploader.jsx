// src/components/agent/DocumentUploader.jsx
// Upload + list agent documents (verification and renewal share it).
// Client checks are a convenience only: the server verifies the real file content (magic bytes),
// size and type, and decides who may add or remove documents.

import { useRef, useState } from 'react';
import { DOCUMENT_STATUS, DOCUMENT_TYPE_LABELS, formatBytes, formatTimestamp } from './agentUtils';
import { Icon, StatusBadge, btnDanger, btnOutline, btnPrimary, inputClass, labelClass } from './agentUi';

export const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

function validateFile(file) {
  if (!ACCEPTED_TYPES.includes(file.type)) return 'Only PDF, JPG or PNG files are accepted.';
  if (file.size === 0) return 'That file is empty.';
  if (file.size > MAX_DOCUMENT_BYTES) return `That file is ${formatBytes(file.size)}. The maximum is 10 MB.`;
  return '';
}

export default function DocumentUploader({
  documents,
  types,
  defaultType,
  canUpload,
  lockedMessage,
  onUpload,
  onDelete,
  canDelete = () => true,
  emptyText = 'No documents uploaded yet.',
}) {
  const [type, setType] = useState(defaultType || types[0]);
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [confirmId, setConfirmId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const inputRef = useRef(null);
  const lockRef = useRef(false);

  const choose = (fileList) => {
    const picked = fileList && fileList[0];
    if (!picked) return;
    const problem = validateFile(picked);
    setError(problem);
    setFile(problem ? null : picked);
  };

  const submit = async () => {
    if (!file || lockRef.current) return;
    lockRef.current = true;
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('document', file);
      formData.append('documentType', type);
      await onUpload(formData);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      setError(err.message || 'The upload failed. Please try again.');
    } finally {
      lockRef.current = false;
      setUploading(false);
    }
  };

  const remove = async (doc) => {
    if (deletingId) return;
    setConfirmId(null);
    setDeletingId(doc.document_id);
    setError('');
    try {
      await onDelete(doc);
    } catch (err) {
      setError(err.message || 'Could not remove that document.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      {canUpload ? (
        <div className="rounded-xl border border-border-subtle bg-surface-container-low p-4 md:p-5 mb-6" data-uploader>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label htmlFor="doc-type" className={labelClass}>Document type</label>
              <select id="doc-type" value={type} onChange={(e) => setType(e.target.value)} disabled={uploading} className={inputClass}>
                {types.map((t) => (
                  <option key={t} value={t}>{DOCUMENT_TYPE_LABELS[t] || t}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <span className={labelClass}>File</span>
              <label
                className={`flex items-center gap-3 rounded-lg border-2 border-dashed px-4 py-3 min-h-[52px] cursor-pointer transition-colors ${dragging ? 'border-primary bg-surface-container' : 'border-border-subtle bg-surface-container-lowest hover:border-primary'}`}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); choose(e.dataTransfer.files); }}
              >
                <Icon name="upload_file" className="text-on-surface-variant" />
                <span className="flex-1 min-w-0 text-body-sm font-body-sm text-on-surface-variant truncate">
                  {file ? `${file.name} (${formatBytes(file.size)})` : 'Choose a file or drag it here — PDF, JPG or PNG, up to 10 MB'}
                </span>
                <input ref={inputRef} type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" onChange={(e) => choose(e.target.files)} disabled={uploading} aria-label="Choose document file" />
              </label>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" className={btnPrimary} disabled={!file || uploading} onClick={submit}>
              {uploading ? 'Uploading…' : 'Upload document'}
            </button>
            {file && !uploading && (
              <button type="button" className={btnOutline} onClick={() => { setFile(null); if (inputRef.current) inputRef.current.value = ''; }}>
                Clear
              </button>
            )}
          </div>
        </div>
      ) : (
        lockedMessage && <p className="rounded-lg bg-surface-container-low border border-border-subtle p-4 text-body-sm font-body-sm text-on-surface-variant mb-6" role="note">{lockedMessage}</p>
      )}

      {error && <p className="mb-4 rounded-lg bg-error-container px-4 py-3 text-body-sm font-body-sm text-on-error-container" role="alert">{error}</p>}

      {documents.length === 0 ? (
        <p className="text-body-sm font-body-sm text-on-surface-variant py-4">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-border-subtle" aria-label="Uploaded documents">
          {documents.map((doc) => {
            const isPdf = /\.pdf$/i.test(doc.file_url || '');
            const removable = canDelete(doc);
            return (
              <li key={doc.document_id} className="py-4" data-document-id={doc.document_id} data-status={doc.status}>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-on-surface-variant flex-shrink-0">
                      <Icon name={isPdf ? 'picture_as_pdf' : 'image'} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-label-md font-label-md text-primary">{DOCUMENT_TYPE_LABELS[doc.document_type] || doc.document_type}</p>
                      <p className="text-label-sm font-label-sm text-on-surface-variant">Uploaded {formatTimestamp(doc.uploaded_at)}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge meta={DOCUMENT_STATUS[doc.status]} fallback={doc.status} />
                    {doc.file_url && (
                      <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className={btnOutline}>
                        View file
                      </a>
                    )}
                    {removable && confirmId !== doc.document_id && (
                      <button type="button" className={btnDanger} disabled={deletingId !== null} onClick={() => setConfirmId(doc.document_id)}>
                        {deletingId === doc.document_id ? 'Removing…' : doc.status === 'rejected' ? 'Remove & replace' : 'Remove'}
                      </button>
                    )}
                  </div>
                </div>
                {doc.status === 'rejected' && (
                  <div className="mt-3 rounded-lg bg-error-container/50 border border-error/30 p-3" role="note">
                    <p className="text-label-sm font-label-sm text-on-error-container">Why it was rejected</p>
                    <p className="text-body-sm font-body-sm text-primary whitespace-pre-wrap break-words">{doc.rejection_reason || 'No reason was given.'}</p>
                  </div>
                )}
                {confirmId === doc.document_id && (
                  <div role="group" aria-label="Confirm removal" className="mt-3 bg-error-container/40 border border-error/30 rounded-lg p-4">
                    <p className="text-label-md font-label-md text-primary">Remove this document?</p>
                    <p className="text-body-sm font-body-sm text-on-surface-variant mt-1">The file will be deleted. You can upload a new one afterwards.</p>
                    <div className="mt-3 flex flex-col sm:flex-row gap-2">
                      <button type="button" className={btnOutline} onClick={() => setConfirmId(null)}>Keep it</button>
                      <button type="button" className={btnDanger} onClick={() => remove(doc)}>Yes, remove</button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
