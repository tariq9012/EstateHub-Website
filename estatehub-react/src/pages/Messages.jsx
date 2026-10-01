// src/pages/Messages.jsx
// Authenticated inbox: conversation list + thread + composer.
//
// Ownership is enforced server-side: every call goes through api/conversations.js
// with the Bearer token, and the backend derives the user from the JWT and
// checks participation. This page never sends a userId; `user.user_id` is only
// used to decide which side a bubble is drawn on.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getConversationMessages, listConversations, sendMessage } from '../api/conversations';
import ConversationList from '../components/messages/ConversationList';
import MessageThread from '../components/messages/MessageThread';
import AccountSidebar, { homePathForRole } from '../components/AccountSidebar';
import { MAX_MESSAGE_LENGTH, conversationSearchText, parseConversationId } from '../components/messages/messageUtils';

const POLL_MS = 15000;

function sameMessages(a, b) {
  // Messages are append-only, so length + last id is enough to detect change.
  if (a.length !== b.length) return false;
  if (a.length === 0) return true;
  return a[a.length - 1].message_id === b[b.length - 1].message_id;
}

export default function Messages() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = parseConversationId(searchParams.get('conversation'));

  const [conversations, setConversations] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [query, setQuery] = useState('');

  const [messages, setMessages] = useState([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState(null);
  const [syncError, setSyncError] = useState(false);

  const [drafts, setDrafts] = useState({}); // per-conversation, so switching threads never loses typed text
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

  const listReqRef = useRef(0); // only the latest inbox request may touch state
  const listBusyRef = useRef(false);
  const threadReqRef = useRef(0); // only the latest thread request may touch state
  const threadBusyRef = useRef(false);
  const sendingRef = useRef(false);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  const loadConversations = useCallback(async ({ silent = false } = {}) => {
    // A background refresh never competes with a user-visible load in flight.
    if (silent && listBusyRef.current) return;
    const reqId = ++listReqRef.current; // only the latest request may touch state (no out-of-order overwrites)
    if (!silent) {
      listBusyRef.current = true;
      setListLoading(true);
      setListError('');
    }
    try {
      const data = await listConversations();
      if (reqId !== listReqRef.current) return;
      setConversations(data?.conversations || []);
      setListError('');
    } catch (err) {
      if (reqId !== listReqRef.current) return;
      if (!silent) setListError(err.message || 'Could not load conversations.');
    } finally {
      if (reqId === listReqRef.current) {
        listBusyRef.current = false;
        setListLoading(false);
      }
    }
  }, []);

  const loadThread = useCallback(async (id, { silent = false } = {}) => {
    const reqId = ++threadReqRef.current;
    if (!silent) {
      threadBusyRef.current = true;
      setThreadLoading(true);
      setThreadError(null);
      setMessages([]);
    }
    try {
      // The backend also marks the other party's messages as read here.
      const data = await getConversationMessages(id);
      if (reqId !== threadReqRef.current) return false;
      const next = data?.messages || [];
      setMessages((prev) => (sameMessages(prev, next) ? prev : next));
      setSyncError(false);
      setThreadError(null);
      return true;
    } catch (err) {
      if (reqId !== threadReqRef.current) return false;
      if (silent) setSyncError(true);
      else setThreadError({ message: err.message || 'Could not load messages.', status: err.status });
      return false;
    } finally {
      if (reqId === threadReqRef.current) {
        threadBusyRef.current = false;
        setThreadLoading(false);
      }
    }
  }, []);

  // Initial inbox load.
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Open / switch / close a thread.
  useEffect(() => {
    setSendError('');
    setSyncError(false);
    if (!selectedId) {
      threadReqRef.current += 1; // invalidate anything in flight
      threadBusyRef.current = false;
      setMessages([]);
      setThreadError(null);
      setThreadLoading(false);
      return;
    }
    loadThread(selectedId).then((ok) => {
      // Server has now marked this thread read — re-fetch the inbox so unread badges are real, not faked.
      if (ok) loadConversations({ silent: true });
    });
  }, [selectedId, loadThread, loadConversations]);

  // Auto-refresh while the tab is visible (also on returning to the tab).
  // Thread first (marks read), then the inbox, so badges reflect the result.
  const refreshRef = useRef(null);
  refreshRef.current = async () => {
    if (sendingRef.current) return;
    if (selectedIdRef.current && !threadBusyRef.current) await loadThread(selectedIdRef.current, { silent: true });
    await loadConversations({ silent: true });
  };
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') refreshRef.current();
    };
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  const handleSelect = (id) => setSearchParams({ conversation: String(id) });
  const handleBack = () => setSearchParams({});

  const draft = selectedId ? drafts[selectedId] || '' : '';
  const setDraft = (value) => {
    if (!selectedId) return;
    setDrafts((prev) => ({ ...prev, [selectedId]: value }));
    if (sendError) setSendError('');
  };

  const handleSend = async () => {
    const conversationId = selectedId;
    const text = draft.trim();
    if (!conversationId || !text || sendingRef.current) return;
    if (text.length > MAX_MESSAGE_LENGTH) {
      setSendError(`Messages are limited to ${MAX_MESSAGE_LENGTH} characters.`);
      return;
    }
    sendingRef.current = true;
    setSending(true);
    setSendError('');
    try {
      // POST returns the full refreshed thread, so no extra round-trip is needed for messages.
      const data = await sendMessage(conversationId, text);
      setDrafts((prev) => ({ ...prev, [conversationId]: '' }));
      if (selectedIdRef.current === conversationId) {
        threadReqRef.current += 1; // drop any older in-flight poll
        setMessages(data?.messages || []);
        setSyncError(false);
      }
      loadConversations({ silent: true }); // refresh preview + ordering
    } catch (err) {
      if (selectedIdRef.current === conversationId) setSendError(err.message || 'Could not send your message.');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? conversations.filter((c) => conversationSearchText(c).includes(q)) : conversations;
  }, [conversations, query]);

  const totalUnread = useMemo(() => conversations.reduce((sum, c) => sum + (Number(c.unread_count) || 0), 0), [conversations]);
  const selectedConversation = useMemo(() => conversations.find((c) => c.conversation_id === selectedId) || null, [conversations, selectedId]);

  const homePath = homePathForRole(user?.role);
  const threadOpen = selectedId !== null; // on mobile this swaps the inbox for the thread
  const inboxEmpty = !listLoading && !listError && conversations.length === 0;

  return (
    <>
      {/* TopNavBar (Mobile Only) — hidden while a thread is open to give the chat the full screen */}
      <header className={`${threadOpen ? 'hidden' : 'flex'} bg-surface-container-lowest border-b border-border-subtle shadow-sm justify-between items-center w-full px-margin-mobile h-20 fixed top-0 z-50 md:hidden`}>
        <div className="text-headline-md font-headline-md font-extrabold tracking-tight text-primary">Messages</div>
        <div className="flex items-center gap-4">
          <Link to="/browse-properties" aria-label="Browse Properties">
            <span aria-hidden="true" className="material-symbols-outlined text-primary">search</span>
          </Link>
          <Link to={homePath} aria-label="Back to dashboard">
            <span aria-hidden="true" className="material-symbols-outlined text-primary">home</span>
          </Link>
        </div>
      </header>

      {/* SideNavBar (Desktop) */}
      <AccountSidebar active="messages" unreadMessages={totalUnread} />

      {/* Main */}
      <main className={`ml-0 md:ml-64 ${threadOpen ? 'pt-0' : 'pt-20'} md:pt-0 h-dvh flex flex-col`}>
        <div className="hidden md:flex flex-shrink-0 justify-between items-end px-8 lg:px-10 pt-8 pb-6">
          <div>
            <h1 className="text-headline-lg font-headline-lg text-primary">Messages</h1>
            <p className="text-body-md font-body-md text-on-surface-variant mt-2">Your conversations with agents and buyers.</p>
          </div>
        </div>

        <div className="flex-1 min-h-0 md:px-8 lg:px-10 md:pb-8">
          <div className="h-full flex bg-surface-container-lowest md:rounded-2xl md:border md:border-border-subtle md:shadow-sm overflow-hidden">
            <ConversationList
              className={`${threadOpen ? 'hidden md:flex' : 'flex'} w-full md:w-[340px] lg:w-[380px] flex-shrink-0 flex-col md:border-r border-border-subtle`}
              conversations={filtered}
              totalCount={conversations.length}
              loading={listLoading}
              error={listError}
              onRetry={() => loadConversations()}
              selectedId={selectedId}
              onSelect={handleSelect}
              currentUserId={user?.user_id}
              currentRole={user?.role}
              query={query}
              onQueryChange={setQuery}
              totalUnread={totalUnread}
            />

            {threadOpen ? (
              <MessageThread
                key={selectedId}
                className="flex flex-1 min-w-0 flex-col"
                conversation={selectedConversation}
                listLoading={listLoading}
                messages={messages}
                loading={threadLoading}
                error={threadError}
                syncError={syncError}
                onRetry={() => loadThread(selectedId).then((ok) => ok && loadConversations({ silent: true }))}
                onBack={handleBack}
                currentUserId={user?.user_id}
                draft={draft}
                onDraftChange={setDraft}
                onSend={handleSend}
                sending={sending}
                sendError={sendError}
              />
            ) : (
              <div className="hidden md:flex flex-1 flex-col items-center justify-center text-center px-6 bg-surface">
                <div className="mb-4 w-14 h-14 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant">
                  <span aria-hidden="true" className="material-symbols-outlined text-[28px]">forum</span>
                </div>
                {inboxEmpty ? (
                  <>
                    <p className="text-label-md font-label-md text-primary mb-1">Nothing to read yet</p>
                    <p className="text-body-sm font-body-sm text-on-surface-variant max-w-xs">Once you start a conversation, the full history will open here.</p>
                  </>
                ) : (
                  <>
                    <p className="text-label-md font-label-md text-primary mb-1">Select a conversation</p>
                    <p className="text-body-sm font-body-sm text-on-surface-variant max-w-xs">Choose a conversation from the inbox to read the full history and reply.</p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
