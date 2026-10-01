// src/components/messages/MessageThread.jsx
// Right pane: conversation header + related property, message history,
// and the composer. Handles loading / error / empty-thread states.

import { useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Avatar from './Avatar';
import {
  MAX_MESSAGE_LENGTH,
  formatClock,
  formatDayLabel,
  formatPrice,
  formatPropertyLocation,
  fullName,
  isSameDay,
  parseDbDate,
  roleLabel,
} from './messageUtils';

const NEAR_BOTTOM_PX = 120;

function ThreadSkeleton() {
  return (
    <div className="space-y-4 animate-pulse" aria-hidden="true">
      <div className="h-10 w-2/3 rounded-2xl bg-surface-container" />
      <div className="h-10 w-1/2 rounded-2xl bg-surface-container-high ml-auto" />
      <div className="h-16 w-3/5 rounded-2xl bg-surface-container" />
      <div className="h-10 w-2/5 rounded-2xl bg-surface-container-high ml-auto" />
    </div>
  );
}

function PropertyStrip({ conversation }) {
  if (!conversation.property_id || !conversation.property_title) {
    return (
      <p className="px-4 md:px-6 py-2.5 bg-surface-container-low border-t border-border-subtle text-label-sm font-label-sm text-on-surface-variant">
        General conversation · not linked to a property
      </p>
    );
  }
  const meta = [formatPropertyLocation(conversation), formatPrice(conversation.property_price), conversation.property_listing_type === 'rent' ? 'For rent' : conversation.property_listing_type === 'sale' ? 'For sale' : '']
    .filter(Boolean)
    .join(' · ');

  return (
    <Link
      to={`/property-details/${conversation.property_id}`}
      className="flex items-center gap-3 px-4 md:px-6 py-2.5 bg-surface-container-low border-t border-border-subtle hover:bg-surface-container transition-colors"
    >
      <div className="w-10 h-10 rounded-lg bg-surface-container overflow-hidden flex-shrink-0 flex items-center justify-center text-on-surface-variant">
        {conversation.property_image_url ? (
          <img className="w-full h-full object-cover" src={conversation.property_image_url} alt="" />
        ) : (
          <span aria-hidden="true" className="material-symbols-outlined text-[20px]">home</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-label-md font-label-md text-primary truncate">{conversation.property_title}</p>
        {meta && <p className="text-label-sm font-label-sm text-on-surface-variant truncate">{meta}</p>}
      </div>
      <span className="material-symbols-outlined text-[18px] text-on-surface-variant flex-shrink-0" aria-hidden="true">
        chevron_right
      </span>
    </Link>
  );
}

function Bubble({ message, mine, showName, senderName }) {
  const date = parseDbDate(message.created_at);
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] md:max-w-[70%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
        {showName && !mine && <span className="mb-1 ml-1 text-label-sm font-label-sm text-on-surface-variant">{senderName}</span>}
        <div
          className={`px-4 py-2.5 rounded-2xl text-body-sm font-body-sm whitespace-pre-wrap break-words ${
            mine ? 'bg-primary-container text-on-primary rounded-br-md' : 'bg-surface-container-low border border-border-subtle text-on-surface rounded-bl-md'
          }`}
        >
          {message.message_text}
        </div>
        {date && <span className="mt-1 mx-1 text-[11px] text-on-surface-variant">{formatClock(date)}</span>}
      </div>
    </div>
  );
}

function MessageList({ messages, currentUserId }) {
  const nodes = [];
  let prevDate = null;
  let prevSender = null;
  messages.forEach((message) => {
    const date = parseDbDate(message.created_at);
    if (date && (!prevDate || !isSameDay(date, prevDate))) {
      nodes.push(
        <div key={`day-${message.message_id}`} className="flex justify-center py-2">
          <span className="text-label-sm font-label-sm text-on-surface-variant bg-surface-container-low border border-border-subtle rounded-full px-3 py-1">{formatDayLabel(date)}</span>
        </div>
      );
      prevSender = null;
    }
    const mine = message.sender_id === currentUserId;
    nodes.push(
      <Bubble
        key={message.message_id}
        message={message}
        mine={mine}
        showName={prevSender !== message.sender_id}
        senderName={fullName(message.first_name, message.last_name)}
      />
    );
    prevDate = date || prevDate;
    prevSender = message.sender_id;
  });
  return <div className="space-y-1.5">{nodes}</div>;
}

export default function MessageThread({
  className = '',
  conversation,
  listLoading,
  messages,
  loading,
  error,
  syncError,
  onRetry,
  onBack,
  currentUserId,
  draft,
  onDraftChange,
  onSend,
  sending,
  sendError,
}) {
  const scrollRef = useRef(null);
  const stickRef = useRef(true);
  const textareaRef = useRef(null);
  const lastMessageId = messages.length ? messages[messages.length - 1].message_id : null;
  const lastIsMine = messages.length ? messages[messages.length - 1].sender_id === currentUserId : false;

  // Follow new messages only if the reader is already at the bottom (or just sent one).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && (stickRef.current || lastIsMine)) {
      el.scrollTop = el.scrollHeight;
      stickRef.current = true;
    }
  }, [lastMessageId, lastIsMine, loading]);

  // Grow the textarea with its content (capped by max-h in the class list).
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onSend();
    }
  };

  const otherName = conversation ? fullName(conversation.other_first_name, conversation.other_last_name) : '';
  const fatal = Boolean(error) && messages.length === 0;
  const trimmedLength = draft.trim().length;
  const tooLong = draft.length > MAX_MESSAGE_LENGTH;
  const canSend = trimmedLength > 0 && !tooLong && !sending;

  let content;
  if (loading) {
    content = <ThreadSkeleton />;
  } else if (fatal) {
    content = (
      <div className="h-full flex flex-col items-center justify-center text-center px-6" role="alert">
        <div className="mb-4 w-12 h-12 rounded-full bg-error-container flex items-center justify-center text-on-error-container">
          <span aria-hidden="true" className="material-symbols-outlined">error</span>
        </div>
        <p className="text-label-md font-label-md text-primary mb-1">Couldn’t open this conversation</p>
        <p className="text-body-sm font-body-sm text-on-surface-variant mb-5 max-w-sm">{error.message}</p>
        <div className="flex gap-3">
          {error.status !== 403 && error.status !== 404 && (
            <button type="button" onClick={onRetry} className="bg-primary text-on-primary text-label-md font-label-md py-2.5 px-5 rounded-lg hover:opacity-90 transition-opacity">
              Try again
            </button>
          )}
          <button type="button" onClick={onBack} className="text-label-md font-label-md text-primary border border-border-subtle rounded-lg px-5 py-2.5 hover:bg-surface-container-low transition-colors">
            Back to inbox
          </button>
        </div>
      </div>
    );
  } else if (messages.length === 0) {
    content = (
      <div className="h-full flex flex-col items-center justify-center text-center px-6">
        <div className="mb-4 w-12 h-12 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant">
          <span aria-hidden="true" className="material-symbols-outlined">chat_bubble_outline</span>
        </div>
        <p className="text-label-md font-label-md text-primary mb-1">No messages yet</p>
        <p className="text-body-sm font-body-sm text-on-surface-variant max-w-xs">
          {otherName ? `Say hello to ${otherName} to start the conversation.` : 'Send the first message to start the conversation.'}
        </p>
      </div>
    );
  } else {
    content = <MessageList messages={messages} currentUserId={currentUserId} />;
  }

  return (
    <section aria-label="Conversation" className={className}>
      {/* Header */}
      <div className="flex-shrink-0 bg-surface-container-lowest">
        <div className="flex items-center gap-3 px-4 md:px-6 py-3.5">
          <button type="button" onClick={onBack} className="md:hidden -ml-2 p-2 rounded-full hover:bg-surface-container-low transition-colors" aria-label="Back to inbox">
            <span aria-hidden="true" className="material-symbols-outlined text-primary">arrow_back</span>
          </button>
          {conversation ? (
            <>
              <Avatar firstName={conversation.other_first_name} lastName={conversation.other_last_name} src={conversation.other_avatar_url} />
              <div className="min-w-0">
                <h2 className="text-body-md font-body-md font-semibold text-primary truncate">{otherName}</h2>
                {roleLabel(conversation.other_role) && <p className="text-label-sm font-label-sm text-on-surface-variant">{roleLabel(conversation.other_role)}</p>}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3 animate-pulse" aria-hidden={!listLoading}>
              <div className="w-11 h-11 rounded-full bg-surface-container-high" />
              <div className="h-4 w-32 rounded bg-surface-container-high" />
            </div>
          )}
        </div>
        {conversation && <PropertyStrip conversation={conversation} />}
      </div>

      {/* History */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 min-h-0 overflow-y-auto bg-surface px-4 md:px-6 py-5" role="log" aria-live="polite" aria-label="Message history">
        {syncError && !loading && (
          <p className="mb-3 text-center text-label-sm font-label-sm text-on-surface-variant bg-surface-container-low border border-border-subtle rounded-lg px-3 py-2">
            Couldn’t refresh just now — showing the last loaded messages. We’ll keep trying.
          </p>
        )}
        {content}
      </div>

      {/* Composer */}
      {!fatal && (
        <div className="flex-shrink-0 border-t border-border-subtle bg-surface-container-lowest px-4 md:px-6 pt-3 pb-3 md:pb-4" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          {sendError && (
            <p className="mb-2 text-label-sm font-label-sm text-error" role="alert">
              {sendError} Your message is still in the box — press send to try again.
            </p>
          )}
          <div className="flex items-end gap-3">
            <label className="flex-1 min-w-0">
              <span className="sr-only">Write a message</span>
              <textarea
                ref={textareaRef}
                rows={1}
                value={draft}
                onChange={(e) => onDraftChange(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={sending || loading}
                placeholder={otherName ? `Message ${otherName}…` : 'Write a message…'}
                className="w-full resize-none max-h-40 rounded-xl border border-border-subtle bg-surface px-4 py-3 text-body-sm font-body-sm text-on-surface placeholder:text-outline focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60"
              />
            </label>
            <button
              type="button"
              onClick={onSend}
              disabled={!canSend}
              aria-label={sending ? 'Sending message' : 'Send message'}
              className="flex-shrink-0 h-[46px] px-5 bg-primary text-on-primary text-label-md font-label-md rounded-xl flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="hidden sm:inline">{sending ? 'Sending…' : 'Send'}</span>
              <span aria-hidden="true" className="material-symbols-outlined text-[20px]">{sending ? 'progress_activity' : 'send'}</span>
            </button>
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] text-on-surface-variant">
            <span className="hidden sm:inline">Enter to send · Shift+Enter for a new line</span>
            {draft.length > MAX_MESSAGE_LENGTH - 500 && (
              <span className={`ml-auto ${tooLong ? 'text-error font-semibold' : ''}`}>
                {draft.length}/{MAX_MESSAGE_LENGTH}
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
