'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@/types';

interface Props {
  messages: ChatMessage[];
  myId:     string | null;
  onSend:   (text: string) => void;
  /** Optional: render in a compact bottom-sheet style on mobile */
  className?: string;
}

export function Chat({ messages, myId, onSend, className = '' }: Props) {
  const [text,   setText]   = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
  }

  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-3 py-2 space-y-2"
      >
        {messages.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-6">No messages yet — say hi 👋</p>
        ) : (
          messages.map((m) => {
            if (m.user_id === 'system') {
              return (
                <p key={m.id} className="text-[11px] text-gray-500 italic text-center">
                  {m.text}
                </p>
              );
            }
            const mine = m.user_id === myId;
            return (
              <div
                key={m.id}
                className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
              >
                {!mine && (
                  <span className="text-[10px] text-gray-400 px-2 mb-0.5">{m.user_name}</span>
                )}
                <div
                  className={`max-w-[80%] px-3 py-1.5 rounded-2xl text-sm break-words
                    ${mine
                      ? 'bg-brand text-white rounded-br-sm'
                      : 'bg-gray-800 text-gray-100 rounded-bl-sm'}`}
                >
                  {m.text}
                </div>
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={submit} className="flex items-center gap-2 px-3 py-2 border-t border-gray-800 bg-gray-950">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          maxLength={500}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-full px-4 py-2 text-sm text-white
                     placeholder-gray-500 outline-none focus:border-brand"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          aria-label="Send"
          className="w-9 h-9 rounded-full bg-brand text-white flex items-center justify-center
                     disabled:opacity-40 hover:bg-brand-dark active:scale-95 transition-all"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/>
          </svg>
        </button>
      </form>
    </div>
  );
}
