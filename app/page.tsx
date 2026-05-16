'use client';

import { useEffect, useRef, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import type {
  RoomSummary, ServerToClientEvents, ClientToServerEvents,
} from '@/types';

type LobbySocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const DEFAULT_ROOM_CODE = 'LOBBY';

export default function HomePage() {
  const router = useRouter();

  const [tab,       setTab]       = useState<'rooms' | 'create' | 'join'>('rooms');
  const [roomName,  setRoomName]  = useState('');
  const [roomCode,  setRoomCode]  = useState('');
  const [userName,  setUserName]  = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const [rooms,        setRooms]        = useState<RoomSummary[]>([]);
  const [pendingCode,  setPendingCode]  = useState<string | null>(null); // waiting for host approval
  const socketRef = useRef<LobbySocket | null>(null);

  // Persist the chosen display name across visits
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('mr.userName') : null;
    if (saved) setUserName(saved);
  }, []);
  useEffect(() => {
    if (userName) localStorage.setItem('mr.userName', userName);
  }, [userName]);

  // Lobby socket: list rooms + handle join request results
  useEffect(() => {
    const socket: LobbySocket = io({ transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('connect', () => socket.emit('list_rooms'));
    socket.on('rooms_list', setRooms);
    socket.on('join_request_result', ({ roomCode: code, approved }) => {
      setPendingCode(null);
      if (approved) {
        router.push(`/room/${code}?name=${encodeURIComponent(userNameRef.current)}`);
      } else {
        setError('Host denied your request to join.');
      }
    });
    socket.on('error', (msg) => setError(msg));
    return () => { socket.disconnect(); socketRef.current = null; };
  }, [router]);

  // Always-current userName ref so the socket callback isn't stale
  const userNameRef = useRef(userName);
  useEffect(() => { userNameRef.current = userName; }, [userName]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!roomName.trim() || !userName.trim()) return;
    setLoading(true); setError(null);

    try {
      const res  = await fetch('/api/rooms', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: roomName, visibility }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to create room');
      router.push(`/room/${data.room.code}?name=${encodeURIComponent(userName)}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleJoin(e: FormEvent) {
    e.preventDefault();
    if (!roomCode.trim() || !userName.trim()) return;
    enterRoom(roomCode.toUpperCase(), false);
  }

  /** Either directly enter (default / no-host rooms) or send a join request. */
  function enterRoom(code: string, isDefault: boolean) {
    if (!userName.trim()) { setError('Enter your name first'); setTab('rooms'); return; }
    setError(null);
    if (isDefault || code === DEFAULT_ROOM_CODE) {
      router.push(`/room/${code}?name=${encodeURIComponent(userName)}`);
      return;
    }
    // Request host approval via socket
    setPendingCode(code);
    socketRef.current?.emit('request_join', { roomCode: code, userName });
  }

  function cancelPending() {
    setPendingCode(null);
  }

  return (
    <main className="min-h-screen bg-gray-950 flex flex-col items-center px-4 py-8 sm:py-14">
      {/* Logo */}
      <div className="mb-6 sm:mb-8 text-center">
        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-brand flex items-center justify-center mx-auto mb-3 shadow-lg shadow-brand/30">
          <svg className="w-7 h-7 sm:w-8 sm:h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/>
          </svg>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Music Room</h1>
        <p className="text-gray-400 mt-1 text-xs sm:text-sm">Listen together, in sync</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-md md:max-w-2xl bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
        {/* Always-on name field */}
        <div className="px-5 pt-5 pb-3 border-b border-gray-800">
          <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Your name</label>
          <input
            type="text"
            placeholder="Jonah"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            className="mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white
                       placeholder-gray-600 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-800">
          {(['rooms', 'create', 'join'] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(null); }}
              className={`flex-1 py-3 text-xs sm:text-sm font-semibold capitalize transition-colors
                ${tab === t ? 'text-white border-b-2 border-brand' : 'text-gray-500 hover:text-gray-300'}`}
            >
              {t === 'rooms' ? 'Rooms' : t === 'create' ? 'Create' : 'Join by code'}
            </button>
          ))}
        </div>

        <div className="p-5 sm:p-6">
          {error && (
            <div className="mb-4 px-3 py-2 bg-red-900/40 border border-red-700 rounded-lg text-sm text-red-300">
              {error}
            </div>
          )}

          {pendingCode && (
            <div className="mb-4 px-3 py-3 bg-brand/10 border border-brand/40 rounded-lg text-sm text-brand-light flex items-center justify-between gap-3">
              <span>Waiting for host of <b>{pendingCode}</b> to approve…</span>
              <button onClick={cancelPending} className="text-xs underline">cancel</button>
            </div>
          )}

          {tab === 'rooms' && (
            <RoomsList
              rooms={rooms}
              onEnter={enterRoom}
              disabled={!userName.trim() || !!pendingCode}
            />
          )}

          {tab === 'create' && (
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <Input
                label="Room name"
                placeholder="Friday night vibes"
                value={roomName}
                onChange={setRoomName}
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">Visibility</label>
                <div className="flex gap-2">
                  {(['public', 'private'] as const).map((v) => (
                    <button
                      type="button"
                      key={v}
                      onClick={() => setVisibility(v)}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium capitalize transition-colors
                        ${visibility === v
                          ? 'bg-brand text-white'
                          : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-gray-500">
                  {visibility === 'public'
                    ? 'Listed in the rooms tab. Anyone needs host approval to join.'
                    : 'Hidden from the rooms list — only joinable by code.'}
                </p>
              </div>
              <SubmitButton loading={loading}>Create Room</SubmitButton>
            </form>
          )}

          {tab === 'join' && (
            <form onSubmit={handleJoin} className="flex flex-col gap-4">
              <Input
                label="Room code"
                placeholder="ABC12345"
                value={roomCode}
                onChange={(v) => setRoomCode(v.toUpperCase())}
                className="tracking-widest uppercase"
              />
              <SubmitButton loading={loading}>Request to Join</SubmitButton>
              <p className="text-[11px] text-gray-500 -mt-2">
                Hint: the always-on test room code is <span className="font-mono text-gray-300">LOBBY</span>.
              </p>
            </form>
          )}
        </div>
      </div>

      <p className="mt-6 text-xs text-gray-600">Powered by YouTube · Built for fun</p>
    </main>
  );
}

// ─── sub-components ───────────────────────────────────────────────────────────

function RoomsList({
  rooms, onEnter, disabled,
}: {
  rooms:    RoomSummary[];
  onEnter:  (code: string, isDefault: boolean) => void;
  disabled: boolean;
}) {
  // Ensure the default room is always shown, even before the socket replies.
  const merged = ensureDefault(rooms);

  return (
    <ul className="flex flex-col gap-2 max-h-96 overflow-y-auto -mx-1 px-1">
      {merged.map((r) => (
        <li key={r.code}>
          <button
            onClick={() => onEnter(r.code, r.is_default)}
            disabled={disabled}
            className="w-full flex items-center justify-between gap-3 px-3 py-3 rounded-xl
                       bg-gray-800 hover:bg-gray-700 disabled:opacity-50
                       disabled:cursor-not-allowed transition-colors text-left"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0
                ${r.is_default ? 'bg-brand/30' : 'bg-gray-700'}`}>
                <svg className="w-4 h-4 text-brand-light" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/>
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-sm text-white font-medium truncate flex items-center gap-2">
                  {r.name}
                  {r.is_default && (
                    <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5
                                     bg-brand/30 text-brand-light rounded">Default</span>
                  )}
                </p>
                <p className="text-[11px] text-gray-500 font-mono">
                  {r.code} · {r.user_count} listener{r.user_count !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-brand-light flex-shrink-0">
              {r.is_default ? 'Join' : 'Request'}
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M10 17l5-5-5-5v10z"/>
              </svg>
            </div>
          </button>
        </li>
      ))}

      {merged.length === 1 && (
        <p className="text-[11px] text-gray-500 text-center pt-2">
          Only the default room is up — create one to host with friends.
        </p>
      )}
    </ul>
  );
}

function ensureDefault(rooms: RoomSummary[]): RoomSummary[] {
  if (rooms.some((r) => r.code === DEFAULT_ROOM_CODE)) return rooms;
  return [
    { code: DEFAULT_ROOM_CODE, name: 'Lobby', user_count: 0, is_default: true, visibility: 'public' },
    ...rooms,
  ];
}

function Input({
  label, placeholder, value, onChange, className = '',
}: {
  label: string; placeholder: string; value: string;
  onChange: (v: string) => void; className?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</label>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        className={`bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white
                    placeholder-gray-600 text-sm outline-none
                    focus:border-brand focus:ring-1 focus:ring-brand transition-colors ${className}`}
      />
    </div>
  );
}

function SubmitButton({ children, loading }: { children: React.ReactNode; loading: boolean }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="mt-1 w-full py-3 rounded-xl bg-brand text-white font-semibold text-sm
                 hover:bg-brand-dark active:scale-[0.98] transition-all
                 disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {loading ? 'Loading…' : children}
    </button>
  );
}
