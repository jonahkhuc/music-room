'use client';

import { useEffect, useRef, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import type { RoomSummary, ServerToClientEvents, ClientToServerEvents } from '@/types';
import { useT, LanguageSelector } from '@/contexts/LanguageContext';

type LobbySocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const DEFAULT_ROOM_CODE = 'LOBBY';

export default function HomePage() {
  const router = useRouter();
  const { t }  = useT();

  const [tab,        setTab]        = useState<'rooms' | 'create' | 'join'>('rooms');
  const [roomName,   setRoomName]   = useState('');
  const [roomCode,   setRoomCode]   = useState('');
  const [userName,   setUserName]   = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const [rooms,       setRooms]       = useState<RoomSummary[]>([]);
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const socketRef = useRef<LobbySocket | null>(null);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('mr.userName') : null;
    if (saved) setUserName(saved);
  }, []);
  useEffect(() => {
    if (userName) localStorage.setItem('mr.userName', userName);
  }, [userName]);

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
        setError('Host đã từ chối yêu cầu của bạn.');
      }
    });
    socket.on('error', (msg) => setError(msg));
    return () => { socket.disconnect(); socketRef.current = null; };
  }, [router]);

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

  function enterRoom(code: string, isDefault: boolean) {
    if (!userName.trim()) { setError(t.enterNameFirst); setTab('rooms'); return; }
    setError(null);
    const roomData = rooms.find((r) => r.code === code);
    // Public rooms and default room: enter directly without approval
    if (isDefault || code === DEFAULT_ROOM_CODE || roomData?.visibility === 'public') {
      router.push(`/room/${code}?name=${encodeURIComponent(userName)}`);
      return;
    }
    // Private room: send join request to host
    setPendingCode(code);
    socketRef.current?.emit('request_join', { roomCode: code, userName });
  }

  const pendingRoom = rooms.find((r) => r.code === pendingCode);
  const pendingName = pendingRoom?.name ?? pendingCode ?? '';

  return (
    <main className="min-h-screen bg-gray-950 flex flex-col items-center px-4 py-8 sm:py-14">
      {/* Language selector */}
      <div className="absolute top-4 right-4">
        <LanguageSelector />
      </div>

      {/* Logo */}
      <div className="mb-6 sm:mb-8 text-center">
        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-brand flex items-center justify-center mx-auto mb-3 shadow-lg shadow-brand/30">
          <svg className="w-7 h-7 sm:w-8 sm:h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/>
          </svg>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Music Room</h1>
        <p className="text-gray-400 mt-1 text-xs sm:text-sm">{t.tagline}</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-md md:max-w-2xl bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
        {/* Name field */}
        <div className="px-5 pt-5 pb-3 border-b border-gray-800">
          <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{t.yourName}</label>
          <input
            type="text"
            placeholder={t.namePlaceholder}
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            className="mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white
                       placeholder-gray-600 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-800">
          {(['rooms', 'create', 'join'] as const).map((tab_) => (
            <button
              key={tab_}
              onClick={() => { setTab(tab_); setError(null); }}
              className={`flex-1 py-3 text-xs sm:text-sm font-semibold capitalize transition-colors
                ${tab === tab_ ? 'text-white border-b-2 border-brand' : 'text-gray-500 hover:text-gray-300'}`}
            >
              {tab_ === 'rooms' ? t.tabRooms : tab_ === 'create' ? t.tabCreate : t.tabJoin}
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
              <span>{t.waiting(pendingName)}</span>
              <button onClick={() => setPendingCode(null)} className="text-xs underline">{t.cancel}</button>
            </div>
          )}

          {tab === 'rooms' && (
            <RoomsList rooms={rooms} onEnter={enterRoom} disabled={!userName.trim() || !!pendingCode} />
          )}

          {tab === 'create' && (
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <Input label={t.roomName} placeholder={t.roomNamePh} value={roomName} onChange={setRoomName} />
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">{t.visibility}</label>
                <div className="flex gap-2">
                  {(['public', 'private'] as const).map((v) => (
                    <button
                      type="button" key={v} onClick={() => setVisibility(v)}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium capitalize transition-colors
                        ${visibility === v ? 'bg-brand text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                    >
                      {v === 'public' ? t.public : t.private}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-gray-500">
                  {visibility === 'public' ? t.publicDesc : t.privateDesc}
                </p>
              </div>
              <SubmitButton loading={loading}>{t.createRoom}</SubmitButton>
            </form>
          )}

          {tab === 'join' && (
            <form onSubmit={handleJoin} className="flex flex-col gap-4">
              <Input
                label={t.roomCode} placeholder={t.roomCodePh}
                value={roomCode} onChange={(v) => setRoomCode(v.toUpperCase())}
                className="tracking-widest uppercase"
              />
              <SubmitButton loading={loading}>{t.requestJoin}</SubmitButton>
              <p className="text-[11px] text-gray-500 -mt-2">
                {t.lobbyHint} <span className="font-mono text-gray-300">LOBBY</span>.
              </p>
            </form>
          )}
        </div>
      </div>

      <p className="mt-6 text-xs text-gray-600">{t.footer}</p>
    </main>
  );
}

function RoomsList({ rooms, onEnter, disabled }: {
  rooms: RoomSummary[]; onEnter: (code: string, isDefault: boolean) => void; disabled: boolean;
}) {
  const { t } = useT();
  const merged = ensureDefault(rooms);
  return (
    <ul className="flex flex-col gap-2 max-h-96 overflow-y-auto -mx-1 px-1">
      {merged.map((r) => (
        <li key={r.code}>
          <button
            onClick={() => onEnter(r.code, r.is_default)} disabled={disabled}
            className="w-full flex items-center justify-between gap-3 px-3 py-3 rounded-xl
                       bg-gray-800 hover:bg-gray-700 disabled:opacity-50
                       disabled:cursor-not-allowed transition-colors text-left"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${r.is_default ? 'bg-brand/30' : 'bg-gray-700'}`}>
                <svg className="w-4 h-4 text-brand-light" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/>
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-sm text-white font-medium truncate flex items-center gap-2">
                  {r.name}
                  {r.is_default && (
                    <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 bg-brand/30 text-brand-light rounded">
                      {t.defaultBadge}
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-gray-500 font-mono flex items-center gap-1.5">
                  {r.code} · {t.listeners(r.user_count)}
                  {!r.is_default && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium
                      ${r.visibility === 'private'
                        ? 'border-yellow-600/50 text-yellow-500'
                        : 'border-green-600/50 text-green-500'}`}>
                      {r.visibility === 'private' ? `🔒 ${t.visibilityPrivate}` : `🌐 ${t.visibilityPublic}`}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-brand-light flex-shrink-0">
              {r.is_default || r.visibility === 'public' ? t.joinBtn : t.requestBtn}
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M10 17l5-5-5-5v10z"/>
              </svg>
            </div>
          </button>
        </li>
      ))}
      {merged.length === 1 && (
        <p className="text-[11px] text-gray-500 text-center pt-2">{t.onlyDefault}</p>
      )}
    </ul>
  );
}

function ensureDefault(rooms: RoomSummary[]): RoomSummary[] {
  if (rooms.some((r) => r.code === DEFAULT_ROOM_CODE)) return rooms;
  return [{ code: DEFAULT_ROOM_CODE, name: 'Lobby', user_count: 0, is_default: true, visibility: 'public' }, ...rooms];
}

function Input({ label, placeholder, value, onChange, className = '' }: {
  label: string; placeholder: string; value: string; onChange: (v: string) => void; className?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</label>
      <input
        type="text" placeholder={placeholder} value={value}
        onChange={(e) => onChange(e.target.value)} required
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
      type="submit" disabled={loading}
      className="mt-1 w-full py-3 rounded-xl bg-brand text-white font-semibold text-sm
                 hover:bg-brand-dark active:scale-[0.98] transition-all
                 disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {loading ? '...' : children}
    </button>
  );
}
