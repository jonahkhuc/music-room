'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { Player }    from '@/components/Player';
import { Queue }     from '@/components/Queue';
import { SearchBar } from '@/components/SearchBar';
import { UserList }  from '@/components/UserList';
import { Chat }      from '@/components/Chat';
import { useRoom }   from '@/hooks/useRoom';
import { useToast, ToastContainer } from '@/components/Toast';
import type { JoinRequest, Song } from '@/types';
import { useT, LanguageSelector } from '@/contexts/LanguageContext';

type RightTab = 'queue' | 'chat' | 'users';

export default function RoomPage() {
  const params       = useParams<{ code: string }>();
  const searchParams = useSearchParams();
  const router       = useRouter();

  const code = params.code?.toUpperCase() ?? '';
  const [userName, setUserName] = useState('');
  const [nameSet,  setNameSet]  = useState(false);

  // Pre-fill name from query param or localStorage
  useEffect(() => {
    const fromQuery = searchParams.get('name')?.trim();
    if (fromQuery) { setUserName(fromQuery); setNameSet(true); return; }
    const fromStore = typeof window !== 'undefined' ? localStorage.getItem('mr.userName') : null;
    if (fromStore) setUserName(fromStore);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const {
    connected, room, users, queue, playerState, messages, joinRequests,
    myId, isHost, error, typingUsers,
    addSong, removeSong, nextSong, prevSong, playSong, togglePlay, seek,
    sendChat, respondJoin, reportProgress, startTyping, stopTyping, setVisibility,
  } = useRoom(nameSet ? code : '', nameSet ? userName : '');

  const { t } = useT();
  const { toasts, addToast } = useToast();
  const handleTyping = (isTyping: boolean) => isTyping ? startTyping() : stopTyping();

  const [copied,    setCopied]    = useState(false);
  const [rightTab,  setRightTab]  = useState<RightTab>('queue');
  // Mobile-only: open chat as a bottom sheet
  const [mobilePanel, setMobilePanel] = useState<null | 'chat' | 'requests'>(null);

  // Toast when visibility changes (server-confirmed)
  const prevVisRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const vis = room?.visibility;
    if (vis === undefined) return;
    if (prevVisRef.current === undefined) { prevVisRef.current = vis; return; }
    if (prevVisRef.current !== vis) {
      prevVisRef.current = vis;
      addToast(vis === 'public' ? t.toastVisPublic : t.toastVisPrivate, 'info');
    }
  }, [room?.visibility]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-pop the "requests" panel when something arrives (host only)
  useEffect(() => {
    if (isHost && joinRequests.length > 0 && mobilePanel == null) {
      // don't force it open on desktop – the side panel is always visible.
      // But on mobile, hint via a tab badge.
    }
  }, [joinRequests.length, isHost]); // eslint-disable-line react-hooks/exhaustive-deps

  function copyLink() {
    const url = `${window.location.origin}/room/${code}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    addToast(t.toastCopied);
  }

  const handleAddSong = useCallback((song: Omit<Song, 'id'>) => {
    addSong(song);
    addToast(t.toastSongAdded);
  }, [addSong, addToast, t]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRemoveSong = useCallback((queueItemId: string) => {
    removeSong(queueItemId);
    addToast(t.toastSongRemoved, 'info');
  }, [removeSong, addToast, t]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRespondJoin = useCallback((id: string, approved: boolean) => {
    const req = joinRequests.find((r) => r.id === id);
    respondJoin(id, approved);
    if (req) addToast(approved ? t.toastApproved(req.user_name) : t.toastDenied(req.user_name), approved ? 'success' : 'info');
  }, [respondJoin, joinRequests, addToast, t]); // eslint-disable-line react-hooks/exhaustive-deps

  // Name prompt if no query param + no stored name
  if (!nameSet) {
    return (
      <main className="h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-gray-900 rounded-2xl p-6 shadow-2xl">
          <h2 className="text-lg font-bold text-white mb-4">What&apos;s your name?</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (userName.trim()) {
                localStorage.setItem('mr.userName', userName);
                setNameSet(true);
              }
            }}
            className="flex flex-col gap-4"
          >
            <input
              autoFocus
              type="text"
              placeholder="Enter your name"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              required
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white
                         placeholder-gray-600 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
            <button
              type="submit"
              className="py-3 rounded-xl bg-brand text-white font-semibold text-sm hover:bg-brand-dark transition-all"
            >
              Join Room
            </button>
          </form>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button onClick={() => router.push('/')} className="text-brand underline text-sm">
            Back to home
          </button>
        </div>
      </main>
    );
  }

  const pendingCount = joinRequests.length;

  return (
    <main className="h-screen overflow-hidden bg-gray-950 flex flex-col">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-3 sm:px-6 py-3 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => router.push('/')} className="text-gray-400 hover:text-white transition-colors flex-shrink-0">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
            </svg>
          </button>
          <div className="min-w-0">
            <h1 className="font-bold text-white truncate flex items-center gap-2">
              {room?.name ?? code}
              {room?.is_default && (
                <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5
                                 bg-brand/30 text-brand-light rounded">Default</span>
              )}
            </h1>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${connected ? 'bg-green-400' : 'bg-gray-600'}`} />
              <span className="text-xs text-gray-500">
                {connected ? t.listeners(users.length) : t.connecting}
                {isHost && ` ${t.youAreHost}`}
              </span>
              {/* Visibility badge (non-host, read-only) */}
              {room && !isHost && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium
                  ${room.visibility === 'private'
                    ? 'border-yellow-600/50 text-yellow-500'
                    : 'border-green-600/50 text-green-500'}`}>
                  {room.visibility === 'private' ? `🔒 ${t.visibilityPrivate}` : `🌐 ${t.visibilityPublic}`}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <LanguageSelector className="hidden sm:flex" />
          {/* Host: visibility toggle */}
          {isHost && room && (
            <button
              onClick={() => setVisibility(room.visibility === 'private' ? 'public' : 'private')}
              title={room.visibility === 'private' ? t.makePublic : t.makePrivate}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex-shrink-0
                ${room.visibility === 'private'
                  ? 'bg-yellow-900/30 text-yellow-400 hover:bg-yellow-900/50 border border-yellow-700/40'
                  : 'bg-green-900/30 text-green-400 hover:bg-green-900/50 border border-green-700/40'}`}
            >
              {room.visibility === 'private' ? '🔒' : '🌐'}
              <span className="hidden sm:inline">
                {room.visibility === 'private' ? t.visibilityPrivate : t.visibilityPublic}
              </span>
            </button>
          )}
          {/* Host: pending requests badge (mobile) */}
          {isHost && room?.visibility === 'private' && pendingCount > 0 && (
            <button
              onClick={() => setMobilePanel('requests')}
              className="lg:hidden relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg
                         bg-brand/20 text-brand-light text-xs font-medium"
            >
              {t.pendingReqs(pendingCount)}
            </button>
          )}

          {/* Mobile chat toggle */}
          <button
            onClick={() => setMobilePanel('chat')}
            className="lg:hidden flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg
                       bg-gray-800 hover:bg-gray-700 text-xs text-gray-300"
            aria-label="Open chat"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
            </svg>
            Chat
          </button>

          {/* Share */}
          <button
            onClick={copyLink}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700
                       text-xs text-gray-300 transition-colors flex-shrink-0"
          >
            {copied ? (
              <>
                <svg className="w-3.5 h-3.5 text-green-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11A2.99 2.99 0 0 0 18 8a3 3 0 1 0-2.96-3.56L7.95 8.55A3 3 0 1 0 6 11c0 .24.04.47.09.7L5 12.66 2.96 13.7A2.99 2.99 0 0 0 6 14a3 3 0 1 0 .05-2.13l-1.05-.61L8.05 8.4A3 3 0 0 0 11.04 9L18 12.7c-.05.23-.09.46-.09.7A3 3 0 1 0 18 16.08z"/>
                </svg>
                <span className="hidden sm:inline">Share · </span>
                <span className="font-mono font-bold">{code}</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      {/* Mobile (flex-col): Player → Queue+Search → Chat (bottom-sheet)      */}
      {/* Desktop (lg:flex-row + order): Queue [1] | Player [2] | Chat [3]    */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">

        {/* ── PLAYER section (mobile: top; desktop: middle column) ─────── */}
        <section className="
          flex flex-col min-w-0 min-h-0
          flex-shrink-0 lg:flex-shrink lg:flex-1
          lg:order-2 lg:border-x lg:border-gray-800
        ">
          <Player
            playerState={playerState}
            isHost={isHost}
            onTogglePlay={togglePlay}
            onEnded={nextSong}
            onSeek={seek}
            onPrev={prevSong}
            onNext={nextSong}
            onReportProgress={reportProgress}
          />

          {users.length > 0 && (
            <div className="px-4 py-3 border-b border-gray-800 flex-shrink-0 lg:border-b-0">
              <UserList users={users} myId={myId} />
            </div>
          )}
          {/* Filler on desktop so the middle column extends */}
          <div className="hidden lg:block flex-1" />
        </section>

        {/* ── QUEUE section (mobile: middle; desktop: left column) ─────── */}
        <section className="
          flex flex-col min-w-0 min-h-0
          flex-1 lg:flex-none
          lg:w-72 xl:w-80 2xl:w-96 lg:flex-shrink-0
          lg:order-1
        ">
          <div className="flex items-center justify-between px-4 pt-3 pb-1 flex-shrink-0">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Queue · {queue.length} song{queue.length !== 1 ? 's' : ''}
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            <Queue queue={queue} playerState={playerState} onPlay={playSong} onRemove={handleRemoveSong} canControl={isHost} />
          </div>
          <div className="flex-shrink-0 border-t border-gray-800 px-4 py-3 bg-gray-950/95 backdrop-blur">
            <SearchBar onAdd={handleAddSong} />
          </div>
        </section>

        {/* ── CHAT section (desktop only; mobile uses bottom-sheet) ────── */}
        <aside className="
          hidden lg:flex flex-col
          w-80 xl:w-96 2xl:w-[400px] flex-shrink-0 min-h-0
          lg:order-3
        ">
          {isHost && room?.visibility === 'private' && joinRequests.length > 0 && (
            <JoinRequestsPanel requests={joinRequests} onRespond={handleRespondJoin} />
          )}
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800 flex-shrink-0">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Chat</h2>
          </div>
          <Chat messages={messages} myId={myId} onSend={sendChat} onTyping={handleTyping} typingUsers={typingUsers} className="flex-1 min-h-0" />
        </aside>
      </div>

      {/* ── Mobile: bottom-sheet chat / requests ────────────────────────── */}
      <ToastContainer toasts={toasts} />

      {mobilePanel && (
        <div className="lg:hidden fixed inset-0 z-40 flex flex-col justify-end">
          <button
            aria-label="Close panel"
            onClick={() => setMobilePanel(null)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div className="relative bg-gray-950 border-t border-gray-800 rounded-t-2xl h-[75vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <h2 className="text-sm font-semibold text-white">
                {mobilePanel === 'chat' ? 'Chat' : 'Join requests'}
              </h2>
              <button
                onClick={() => setMobilePanel(null)}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            </div>
            {mobilePanel === 'chat' ? (
              <Chat messages={messages} myId={myId} onSend={sendChat} onTyping={handleTyping} typingUsers={typingUsers} className="flex-1 min-h-0" />
            ) : (
              <div className="flex-1 overflow-y-auto">
                <JoinRequestsPanel requests={joinRequests} onRespond={handleRespondJoin} mobile />
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

// ─── Host: pending-requests panel ──────────────────────────────────────────────

function JoinRequestsPanel({
  requests, onRespond, mobile = false,
}: {
  requests: JoinRequest[];
  onRespond: (id: string, approved: boolean) => void;
  mobile?: boolean;
}) {
  return (
    <div className={`flex-shrink-0 border-b border-gray-800 bg-brand/5 ${mobile ? '' : 'max-h-60 overflow-y-auto'}`}>
      <div className="px-3 py-2 flex items-center gap-2 border-b border-gray-800">
        <svg className="w-3.5 h-3.5 text-brand-light" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
        </svg>
        <h3 className="text-[11px] uppercase tracking-wider text-brand-light font-semibold">
          {requests.length} pending request{requests.length > 1 ? 's' : ''}
        </h3>
      </div>
      <ul className="divide-y divide-gray-800">
        {requests.map((r) => (
          <li key={r.id} className="px-3 py-2 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{r.user_name}</p>
              <p className="text-[10px] text-gray-500">wants to join</p>
            </div>
            <button
              onClick={() => onRespond(r.id, true)}
              className="px-2 py-1 rounded-md bg-brand text-white text-xs font-medium hover:bg-brand-dark"
            >
              Approve
            </button>
            <button
              onClick={() => onRespond(r.id, false)}
              className="px-2 py-1 rounded-md bg-gray-800 text-gray-300 text-xs font-medium hover:bg-gray-700"
            >
              Deny
            </button>
          </li>
        ))}
        {requests.length === 0 && (
          <li className="px-3 py-6 text-center text-xs text-gray-500">No pending requests</li>
        )}
      </ul>
    </div>
  );
}
