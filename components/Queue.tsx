'use client';

import Image from 'next/image';
import type { QueueItem, PlayerState } from '@/types';

interface Props {
  queue:       QueueItem[];
  playerState: PlayerState;
  onPlay:      (queueItemId: string) => void;
  /** When false, click-to-play is disabled (e.g. only host can pick songs) */
  canControl?: boolean;
}

export function Queue({ queue, playerState, onPlay, canControl = true }: Props) {
  const currentId = playerState.current_song?.id;
  const currentIdx = queue.findIndex((q) => q.id === currentId);

  if (queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-gray-500 gap-2">
        <svg className="w-10 h-10 opacity-40" fill="currentColor" viewBox="0 0 24 24">
          <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/>
        </svg>
        <p className="text-sm">No songs yet</p>
      </div>
    );
  }

  return (
    <ol className="divide-y divide-gray-800">
      {queue.map((item, idx) => {
        const isCurrent = item.id === currentId;
        const isPast    = currentIdx >= 0 && idx < currentIdx;
        const song      = item.song;
        if (!song) return null;

        return (
          <li key={item.id}>
            <button
              onClick={() => canControl && onPlay(item.id)}
              disabled={!canControl && !isCurrent}
              title={canControl ? undefined : 'Only the host can change the song'}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors
                ${isCurrent
                  ? 'bg-brand/10 border-l-2 border-brand'
                  : canControl
                    ? 'hover:bg-gray-900 border-l-2 border-transparent'
                    : 'border-l-2 border-transparent cursor-not-allowed'}
                ${isPast ? 'opacity-50 hover:opacity-80' : ''}`}
            >
              {/* Index / now-playing indicator */}
              <div className="w-6 flex-shrink-0 text-center">
                {isCurrent ? (
                  playerState.is_playing ? <NowPlayingBars /> : <PausedIcon />
                ) : (
                  <span className="text-xs text-gray-500 font-mono">{idx + 1}</span>
                )}
              </div>

              {/* Thumbnail (click target) */}
              <div className="relative w-14 h-10 flex-shrink-0 rounded overflow-hidden bg-gray-800 group">
                {song.thumbnail ? (
                  <Image
                    src={song.thumbnail}
                    alt={song.title}
                    fill className="object-cover"
                    sizes="56px"
                  />
                ) : (
                  <div className="w-full h-full bg-gray-800" />
                )}
                {!isCurrent && canControl && (
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  </div>
                )}
              </div>

              {/* Meta */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate leading-tight
                  ${isCurrent ? 'text-brand-light' : 'text-white'}`}>
                  {song.title}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {song.channel}
                  {song.duration && ` · ${song.duration}`}
                </p>
                {item.added_by && (
                  <p className="text-[10px] text-gray-600 truncate">Added by {item.added_by}</p>
                )}
              </div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function NowPlayingBars() {
  return (
    <div className="flex items-end justify-center gap-0.5 h-4">
      {[0, 150, 300].map((d) => (
        <span key={d} className="w-1 bg-brand rounded-full animate-bounce"
              style={{ animationDelay: `${d}ms`, height: '60%' }}/>
      ))}
    </div>
  );
}

function PausedIcon() {
  return (
    <svg className="w-4 h-4 mx-auto text-brand" fill="currentColor" viewBox="0 0 24 24">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
    </svg>
  );
}
