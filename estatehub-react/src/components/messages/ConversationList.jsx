// src/components/messages/ConversationList.jsx
// Left pane: search box + inbox rows (loading / error / empty / no-match states).

import { Link } from 'react-router-dom';
import Avatar from './Avatar';
import { formatListTimestamp, fullName } from './messageUtils';

function ListSkeleton() {
  return (
    <div className="p-4 space-y-5" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex gap-3 animate-pulse">
          <div className="w-11 h-11 rounded-full bg-surface-container-high flex-shrink-0" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-3 w-1/2 rounded bg-surface-container-high" />
            <div className="h-3 w-3/4 rounded bg-surface-container" />
            <div className="h-3 w-2/3 rounded bg-surface-container" />
          </div>
        </div>
      ))}
    </div>
  );
}

function CenteredNote({ icon, title, children }) {
  return (
    <div className="px-6 py-12 text-center">
      <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant">
        <span aria-hidden="true" className="material-symbols-outlined">{icon}</span>
      </div>
      <p className="text-label-md font-label-md text-primary mb-2">{title}</p>
      <div className="text-body-sm font-body-sm text-on-surface-variant">{children}</div>
    </div>
  );
}

function ConversationRow({ conversation, selected, onSelect, currentUserId }) {
  const unread = Number(conversation.unread_count) || 0;
  const name = fullName(conversation.other_first_name, conversation.other_last_name);
  const hasPreview = Boolean(conversation.last_message_text);
  const sentByMe = conversation.last_message_sender_id === currentUserId;

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(conversation.conversation_id)}
        aria-current={selected ? 'true' : undefined}
        className={`w-full text-left flex gap-3 px-4 py-3.5 border-l-2 transition-colors hover:bg-surface-container-low focus:outline-none focus-visible:bg-surface-container-low ${
          selected ? 'bg-surface-container-low border-primary' : 'border-transparent'
        }`}
      >
        <Avatar firstName={conversation.other_first_name} lastName={conversation.other_last_name} src={conversation.other_avatar_url} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className={`text-body-sm font-body-sm text-primary truncate ${unread > 0 ? 'font-semibold' : 'font-medium'}`}>{name}</p>
            <span className="text-label-sm font-label-sm text-on-surface-variant flex-shrink-0">
              {formatListTimestamp(conversation.last_message_at || conversation.created_at)}
            </span>
          </div>
          {conversation.property_title && (
            <p className="mt-0.5 flex items-center gap-1 text-label-sm font-label-sm text-on-surface-variant min-w-0">
              <span aria-hidden="true" className="material-symbols-outlined text-[14px] flex-shrink-0">home</span>
              <span className="truncate">{conversation.property_title}</span>
            </p>
          )}
          <div className="mt-1 flex items-center justify-between gap-2">
            <p className={`text-body-sm font-body-sm truncate ${hasPreview ? (unread > 0 ? 'text-on-surface' : 'text-on-surface-variant') : 'text-outline italic'}`}>
              {hasPreview ? `${sentByMe ? 'You: ' : ''}${conversation.last_message_text}` : 'No messages yet'}
            </p>
            {unread > 0 && (
              <span
                className="flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-on-primary text-[11px] font-semibold flex items-center justify-center"
                aria-label={`${unread} unread message${unread === 1 ? '' : 's'}`}
              >
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </div>
        </div>
      </button>
    </li>
  );
}

export default function ConversationList({
  className = '',
  conversations,
  totalCount,
  loading,
  error,
  onRetry,
  selectedId,
  onSelect,
  currentUserId,
  currentRole,
  query,
  onQueryChange,
  totalUnread,
}) {
  const searching = query.trim().length > 0;

  let body;
  if (loading) {
    body = <ListSkeleton />;
  } else if (error) {
    body = (
      <div className="px-6 py-10 text-center" role="alert">
        <p className="text-body-sm font-body-sm text-error mb-4">{error}</p>
        <button type="button" onClick={onRetry} className="text-label-md font-label-md text-primary border border-border-subtle rounded-lg px-4 py-2 hover:bg-surface-container-low transition-colors">
          Try again
        </button>
      </div>
    );
  } else if (totalCount === 0) {
    body = (
      <CenteredNote icon="forum" title="No conversations yet">
        {currentRole === 'agent' ? (
          <p>When buyers contact you about your listings, their conversations will appear here.</p>
        ) : (
          <>
            <p className="mb-4">Send an inquiry from a property page and your conversation with the agent will show up here.</p>
            <Link to="/browse-properties" className="inline-block bg-primary text-on-primary text-label-md font-label-md py-2.5 px-5 rounded-lg hover:opacity-90 transition-opacity">
              Browse Properties
            </Link>
          </>
        )}
      </CenteredNote>
    );
  } else if (conversations.length === 0) {
    body = (
      <CenteredNote icon="search_off" title="No matches">
        <p>Nothing matches “{query.trim()}”. Try a name, property, or part of a message.</p>
      </CenteredNote>
    );
  } else {
    body = (
      <ul className="divide-y divide-border-subtle">
        {conversations.map((conversation) => (
          <ConversationRow
            key={conversation.conversation_id}
            conversation={conversation}
            selected={conversation.conversation_id === selectedId}
            onSelect={onSelect}
            currentUserId={currentUserId}
          />
        ))}
      </ul>
    );
  }

  return (
    <section aria-label="Conversations" className={className}>
      <div className="p-4 border-b border-border-subtle flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-label-md font-label-md text-primary uppercase tracking-wider">Inbox</h2>
          {totalUnread > 0 && (
            <span className="text-label-sm font-label-sm bg-secondary-container text-on-secondary-container px-2.5 py-1 rounded-full">{totalUnread} unread</span>
          )}
        </div>
        <label className="relative block">
          <span className="sr-only">Search conversations</span>
          <span aria-hidden="true" className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-on-surface-variant pointer-events-none">search</span>
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search name, property, message"
            disabled={loading || Boolean(error) || totalCount === 0}
            className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-border-subtle bg-surface text-body-sm font-body-sm text-on-surface placeholder:text-outline focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60"
          />
        </label>
        {searching && !loading && !error && totalCount > 0 && (
          <p className="mt-2 text-label-sm font-label-sm text-on-surface-variant" aria-live="polite">
            {conversations.length} of {totalCount} conversation{totalCount === 1 ? '' : 's'}
          </p>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">{body}</div>
    </section>
  );
}
