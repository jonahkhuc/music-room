'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import type { PlayerState } from '@/types';
import { useT } from '@/contexts/LanguageContext';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export type DisplayMode = 'default' | 'theater' | 'fullscreen';

interface Props {
  playerState:       PlayerState;
  isHost:            boolean;
  onTogglePlay:      (playing: boolean) => void;
  onEnded:           () => void;
  onSeek:            (seconds: number) => void;
  onPrev:            () => void;
  onNext:            () => void;
  /** Host only: report current playback time so new joiners can sync */
  onReportProgress?: (seconds: number) => void;
}

const CONTAINER_ID = 'yt-player-container';
const SEEK_STEP    = 10;
const REPORT_MS    = 3000;

export function Player({
  playerState, isHost, onTogglePlay, onEnded, onSeek, onPrev, onNext, onReportProgress,
}: Props) {
  const { t } = useT();
  const ytRef            = useRef<any>(null);
  const rootRef          = useRef<HTMLDivElement>(null);
  const readyRef         = useRef(false);
  // Always-current refs (avoid stale closure bugs)
  const playerStateRef   = useRef<PlayerState>(playerState);
  const onEndedRef       = useRef(onEnded);
  // Track what is *actually loaded* in the YT player
  const loadedVideoIdRef = useRef<string | null>(null);
  const lastUpdatedAtRef = useRef<number>(0);

  const [audioOnly,   setAudioOnly]   = useState(false);
  const [displayMode, setDisplayMode] = useState<DisplayMode>('default');
  const [volume,      setVolume]      = useState(80);
  const [muted,       setMuted]       = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration,    setDuration]    = useState(0);
  const [isSeeking,   setIsSeeking]   = useState(false);
  // Tracks per-video fallback when maxresdefault.jpg doesn't exist
  // (older/low-quality videos). Map: videoId → resolved src.
  const [hiResFailed, setHiResFailed] = useState<Record<string, boolean>>({});

  // Sync state when user exits fullscreen via ESC or browser UI
  useEffect(() => {
    function onFsChange() {
      if (!document.fullscreenElement) {
        setDisplayMode((prev) => (prev === 'fullscreen' ? 'default' : prev));
      }
    }
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // ESC also exits theater mode (fullscreen is handled by the browser)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && displayMode === 'theater') setDisplayMode('default');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [displayMode]);

  async function applyMode(m: DisplayMode) {
    if (m === 'fullscreen') {
      const el = rootRef.current;
      if (el?.requestFullscreen) {
        try { await el.requestFullscreen(); setDisplayMode('fullscreen'); }
        catch { setDisplayMode('default'); }
      }
    } else {
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      setDisplayMode(m);
    }
  }

  // Keep refs in sync with props
  useEffect(() => { playerStateRef.current = playerState; }, [playerState]);
  useEffect(() => { onEndedRef.current = onEnded; },       [onEnded]);

  // ── Bootstrap YouTube iframe API ───────────────────────────────────────────
  useEffect(() => {
    if (window.YT?.Player) {
      // API already loaded (e.g. HMR) — create player now if there's a video
      maybeCreatePlayer();
      return;
    }
    const script = document.createElement('script');
    script.src   = 'https://www.youtube.com/iframe_api';
    script.async = true;
    document.head.appendChild(script);
    window.onYouTubeIframeAPIReady = () => maybeCreatePlayer();
    return () => { window.onYouTubeIframeAPIReady = undefined; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function maybeCreatePlayer() {
    if (ytRef.current) return; // already created
    createPlayer();
  }

  function createPlayer() {
    ytRef.current = new window.YT.Player(CONTAINER_ID, {
      height: '100%', width: '100%',
      videoId: '',   // start blank; we load via loadVideoById
      playerVars: { autoplay: 0, controls: 0, rel: 0, modestbranding: 1, playsinline: 1, iv_load_policy: 3 },
      events: {
        onReady: (e: any) => {
          readyRef.current = true;
          e.target.setVolume(volume);
          // Apply the *current* state (use ref, not stale closure)
          applyCurrentState();
        },
        onStateChange: (e: any) => {
          if (e.data === 0) onEndedRef.current(); // ENDED
        },
      },
    });
  }

  // ── Sync player whenever playerState changes ───────────────────────────────
  useEffect(() => {
    if (!readyRef.current) {
      // Player not ready yet — create it if API is loaded
      if (window.YT?.Player && !ytRef.current) createPlayer();
      return;
    }
    applyCurrentState();
  }, [playerState]); // eslint-disable-line react-hooks/exhaustive-deps

  function applyCurrentState() {
    const p     = ytRef.current;
    const state = playerStateRef.current;
    if (!p || !readyRef.current) return;

    const vid = state.current_song?.song?.source_id ?? null;

    if (!vid) {
      p.stopVideo?.();
      loadedVideoIdRef.current = null;
      return;
    }

    if (loadedVideoIdRef.current !== vid) {
      loadedVideoIdRef.current  = vid;
      lastUpdatedAtRef.current  = state.updated_at;
      const lag         = state.is_playing ? (Date.now() - state.updated_at) / 1000 : 0;
      const startSeconds = Math.max(0, state.current_time + lag);
      p.loadVideoById({ videoId: vid, startSeconds });
      if (!state.is_playing) {
        setTimeout(() => { p.pauseVideo?.(); }, 200);
      }
      return;
    }

    // Same song → handle play/pause
    const ytState = p.getPlayerState?.() ?? -1;
    // YT.PlayerState: PLAYING=1, PAUSED=2
    if (state.is_playing  && ytState !== 1) p.playVideo();
    if (!state.is_playing && ytState === 1) p.pauseVideo();

    // Seek if server sent a new seek command (updated_at changed)
    if (state.updated_at !== lastUpdatedAtRef.current && state.updated_at !== 0) {
      lastUpdatedAtRef.current = state.updated_at;
      const lag    = state.is_playing ? (Date.now() - state.updated_at) / 1000 : 0;
      const target = state.current_time + Math.max(0, lag);
      const actual = p.getCurrentTime?.() ?? 0;
      if (Math.abs(actual - target) > 1.5) p.seekTo(target, true);
    }
  }

  // ── Poll progress bar ──────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => {
      const p = ytRef.current;
      if (!p || !readyRef.current || isSeeking) return;
      setCurrentTime(p.getCurrentTime?.() ?? 0);
      setDuration(p.getDuration?.()    ?? 0);
    }, 500);
    return () => clearInterval(t);
  }, [isSeeking]);

  // ── Volume / mute (local) ──────────────────────────────────────────────────
  useEffect(() => {
    const p = ytRef.current;
    if (!p || !readyRef.current) return;
    if (muted) p.mute();
    else       { p.unMute(); p.setVolume(volume); }
  }, [volume, muted]);

  // ── Host-only: push current time to the server every few seconds so new
  //    joiners receive an accurate timestep when they get room_state. ─────────
  useEffect(() => {
    if (!isHost || !onReportProgress) return;
    const t = setInterval(() => {
      const p = ytRef.current;
      if (!p || !readyRef.current) return;
      const sec = p.getCurrentTime?.();
      if (typeof sec === 'number' && isFinite(sec)) onReportProgress(sec);
    }, REPORT_MS);
    return () => clearInterval(t);
  }, [isHost, onReportProgress]);

  // ── UI handlers ───────────────────────────────────────────────────────────
  const handlePlayPause = () => {
    if (!isHost || !playerState.current_song) return;
    onTogglePlay(!playerState.is_playing);
  };

  const handleSkip = (delta: number) => {
    if (!isHost) return;
    const p = ytRef.current;
    if (!p || !readyRef.current) return;
    const now = p.getCurrentTime?.() ?? 0;
    onSeek(Math.max(0, now + delta));
  };

  const handleSeekCommit = (t: number) => {
    setIsSeeking(false);
    if (!isHost) return;
    onSeek(Math.max(0, t));
  };

  const lockTitle = isHost ? undefined : t.hostOnly2;

  const song = playerState.current_song?.song;

  // Upgrade the audio-only artwork to maxresdefault.jpg when possible.
  // Falls back to the original thumbnail if that variant doesn't exist.
  const hiResThumb = (() => {
    const t = song?.thumbnail;
    if (!t) return null;
    const m = t.match(/i\.ytimg\.com\/vi\/([A-Za-z0-9_-]+)\//);
    if (!m) return t;
    if (hiResFailed[m[1]]) return t;
    return `https://i.ytimg.com/vi/${m[1]}/maxresdefault.jpg`;
  })();

  // Theater / fullscreen share the same overlay-style layout. In fullscreen
  // mode the browser fullscreen API takes care of the actual sizing; we apply
  // the same flex styles so the video centers nicely either way.
  const isOverlay = displayMode !== 'default';

  return (
    <div
      ref={rootRef}
      className={`select-none text-white ${
        isOverlay
          ? 'fixed inset-0 z-50 flex flex-col bg-black'
          : 'bg-gray-950'
      }`}
    >
      {/* ── Video area ────────────────────────────────────────────────────── */}
      <div className={`flex justify-center bg-black ${
        isOverlay ? 'flex-1 items-center p-2 sm:p-4 min-h-0' : 'w-full'
      }`}>
        <div
          className="relative bg-black w-full"
          style={
            audioOnly
              ? { height: 0, overflow: 'hidden' }
              : {
                  maxWidth:    '100%',
                  maxHeight:   isOverlay ? '100%' : '60vh',
                  aspectRatio: '16 / 9',
                  overflow:    'hidden',
                }
          }
        >
          {/* YT player always mounted so it keeps playing in audio-only mode */}
          <div id={CONTAINER_ID} className="absolute inset-0" />
          {!song && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 text-gray-400 gap-2">
              <svg className="w-12 h-12 opacity-30" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/>
              </svg>
              <p className="text-sm">{t.queueEmpty}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Audio-only banner ─────────────────────────────────────────────── */}
      {audioOnly && (
        <div className="relative flex flex-col items-center justify-center overflow-hidden px-4 sm:px-6 py-5 sm:py-7">
          {/* Blurred thumbnail backdrop for the "cover-art" feel */}
          {hiResThumb && (
            <div
              aria-hidden
              className="absolute inset-0 bg-cover bg-center opacity-30 blur-2xl scale-110"
              style={{ backgroundImage: `url(${hiResThumb})` }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-gray-950/40 to-gray-950" />

          {hiResThumb ? (
            <div className="relative w-full aspect-video rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10">
              <Image
                src={hiResThumb}
                alt={song?.title ?? ''}
                fill className="object-cover"
                sizes="(min-width: 1024px) 60vw, 100vw"
                quality={90}
                priority
                onError={() => {
                  const m = song?.thumbnail?.match(/i\.ytimg\.com\/vi\/([A-Za-z0-9_-]+)\//);
                  if (m) setHiResFailed((prev) => ({ ...prev, [m[1]]: true }));
                }}
              />
              {playerState.is_playing && (
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-center gap-1.5 pb-5 bg-gradient-to-t from-black/70 via-black/20 to-transparent pt-16">
                  {[0, 150, 300, 450, 600].map((d) => (
                    <span
                      key={d}
                      className="w-1.5 bg-brand-light rounded-full animate-bounce"
                      style={{ animationDelay: `${d}ms`, height: '40px' }}
                    />
                  ))}
                </div>
              )}
              <span className="absolute top-3 right-3 text-[10px] uppercase tracking-widest text-white/90 bg-black/50 backdrop-blur px-2 py-1 rounded-md">
                {t.audioOnly}
              </span>
            </div>
          ) : (
            <div className="relative flex flex-col items-center gap-3 py-10">
              <div className="w-12 h-12 rounded-full bg-brand/30 flex items-center justify-center">
                <svg className={`w-6 h-6 text-brand-light ${playerState.is_playing ? 'animate-pulse' : ''}`} fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/>
                </svg>
              </div>
              <span className="text-xs uppercase tracking-widest text-gray-400">{t.audioOnly}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Progress bar ──────────────────────────────────────────────────── */}
      <div className="px-4 pt-3">
        <input
          type="range" min={0} max={duration || 0} step="0.1"
          value={currentTime}
          disabled={!song || !duration || !isHost}
          title={lockTitle}
          onMouseDown={() => isHost && setIsSeeking(true)}
          onTouchStart={() => isHost && setIsSeeking(true)}
          onChange={(e) => isHost && setCurrentTime(+e.target.value)}
          onMouseUp={(e)  => handleSeekCommit(+(e.target as HTMLInputElement).value)}
          onTouchEnd={(e) => handleSeekCommit(+(e.target as HTMLInputElement).value)}
          className="w-full h-1 accent-brand cursor-pointer disabled:opacity-30"
        />
        <div className="flex justify-between text-[10px] text-gray-500 mt-1 font-mono">
          <span>{fmt(currentTime)}</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>

      {/* ── Song info ─────────────────────────────────────────────────────── */}
      <div className="px-4 pt-2 pb-1 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold truncate text-sm">{song?.title ?? t.nothingPlaying}</p>
          {song?.channel && <p className="text-xs text-gray-400 truncate">{song.channel}</p>}
        </div>
        {!isHost && (
          <span className="flex-shrink-0 text-[10px] uppercase tracking-wider px-1.5 py-0.5
                           bg-gray-800 text-gray-400 rounded">
            {t.listenerBadge}
          </span>
        )}
      </div>

      {/* ── Controls ──────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
        {/* Display: audio-only + mode */}
        <div className="flex items-center gap-1">
          <Btn
            onClick={() => setAudioOnly(!audioOnly)}
            active={audioOnly}
            label={audioOnly ? t.showVideo : t.audioOnly}
          >
            {audioOnly ? <VideoIcon /> : <HeadphonesIcon />}
          </Btn>
          <Btn
            onClick={() => applyMode('default')}
            active={displayMode === 'default'}
            label={t.defaultView}
          >
            <DefaultViewIcon />
          </Btn>
          <Btn
            onClick={() => applyMode('theater')}
            active={displayMode === 'theater'}
            label={t.theaterMode}
          >
            <TheaterIcon />
          </Btn>
          <Btn
            onClick={() => applyMode('fullscreen')}
            active={displayMode === 'fullscreen'}
            label={t.fullscreen}
          >
            <FullscreenIcon />
          </Btn>
        </div>

        {/* Transport (host only) */}
        <div className="flex items-center gap-1" title={lockTitle}>
          <Btn onClick={() => isHost && onPrev()} disabled={!song || !isHost} label={t.prevTrack}><PrevIcon /></Btn>
          <Btn onClick={() => handleSkip(-SEEK_STEP)} disabled={!song || !isHost} label={`-${SEEK_STEP}s`}>
            <ReplayIcon n={SEEK_STEP} />
          </Btn>

          <button
            onClick={handlePlayPause}
            disabled={!song || !isHost}
            title={lockTitle}
            aria-label={playerState.is_playing ? t.pause : t.play}
            className="w-12 h-12 rounded-full bg-brand flex items-center justify-center
                       disabled:opacity-40 disabled:cursor-not-allowed
                       hover:bg-brand-dark active:scale-95 transition-all"
          >
            {playerState.is_playing ? <PauseIcon /> : <PlayIcon />}
          </button>

          <Btn onClick={() => handleSkip(SEEK_STEP)} disabled={!song || !isHost} label={`+${SEEK_STEP}s`}>
            <ForwardIcon n={SEEK_STEP} />
          </Btn>
          <Btn onClick={() => isHost && onNext()} disabled={!song || !isHost} label={t.nextTrack}><NextIcon /></Btn>
        </div>

        {/* Volume */}
        <div className="flex items-center gap-1">
          <Btn onClick={() => setMuted(!muted)} label={muted ? t.unmute : t.mute}>
            {muted || volume === 0 ? <VolMuteIcon /> : volume < 50 ? <VolLowIcon /> : <VolHighIcon />}
          </Btn>
          <input
            type="range" min={0} max={100} value={muted ? 0 : volume}
            onChange={(e) => { setVolume(+e.target.value); setMuted(false); }}
            aria-label={t.volume}
            className="w-16 h-1 accent-brand cursor-pointer hidden sm:block"
          />
        </div>
      </div>
    </div>
  );
}

// ─── helpers & sub-components ─────────────────────────────────────────────────

function fmt(s: number) {
  if (!s || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function Btn({ children, onClick, disabled, label, active }: {
  children: React.ReactNode; onClick: () => void;
  disabled?: boolean; label: string; active?: boolean;
}) {
  return (
    <button
      onClick={onClick} disabled={disabled} aria-label={label} title={label}
      className={`w-9 h-9 rounded-full flex items-center justify-center transition-all
                  active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed
                  ${active ? 'bg-brand/30 text-brand-light' : 'bg-gray-800 text-gray-200 hover:bg-gray-700'}`}
    >
      {children}
    </button>
  );
}

// ─── icons ────────────────────────────────────────────────────────────────────
const PlayIcon       = () => <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>;
const PauseIcon      = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <rect x="5" y="4" width="4" height="16" rx="1.5"/>
    <rect x="15" y="4" width="4" height="16" rx="1.5"/>
  </svg>
);
const PrevIcon       = () => <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>;
const NextIcon       = () => <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>;
const HeadphonesIcon   = () => <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3a9 9 0 0 0-9 9v7a2 2 0 0 0 2 2h3v-8H5v-1a7 7 0 1 1 14 0v1h-3v8h3a2 2 0 0 0 2-2v-7a9 9 0 0 0-9-9z"/></svg>;
const VideoIcon        = () => <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"/></svg>;
const DefaultViewIcon  = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/></svg>;
const TheaterIcon      = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="10" rx="1"/><path d="M2 11h20M2 13h20" strokeWidth="1" opacity="0.4"/></svg>;
const FullscreenIcon   = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>;
const VolMuteIcon    = () => <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.42.05-.63zM19 12c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.17v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z"/></svg>;
const VolLowIcon     = () => <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M7 9v6h4l5 5V4l-5 5H7z"/></svg>;
const VolHighIcon    = () => <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>;

const ReplayIcon = ({ n }: { n: number }) => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
    <text x="12" y="15.5" textAnchor="middle" fontSize="6.5" fontWeight="700" fontFamily="sans-serif">{n}</text>
  </svg>
);
const ForwardIcon = ({ n }: { n: number }) => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/>
    <text x="12" y="15.5" textAnchor="middle" fontSize="6.5" fontWeight="700" fontFamily="sans-serif">{n}</text>
  </svg>
);
