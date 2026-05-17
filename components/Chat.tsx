'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { ChatMessage } from '@/types';
import { useT } from '@/contexts/LanguageContext';

interface Props {
  messages:    ChatMessage[];
  myId:        string | null;
  onSend:      (text: string) => void;
  onTyping?:   (isTyping: boolean) => void;
  typingUsers?: { userId: string; userName: string }[];
  className?:  string;
}

export function Chat({ messages, myId, onSend, onTyping, typingUsers = [], className = '' }: Props) {
  const { t }   = useT();
  const [text,   setText]   = useState('');
  const listRef             = useRef<HTMLDivElement>(null);
  const typingRef           = useRef(false);
  const stopTimerRef        = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, typingUsers.length]);

  const handleChange = useCallback((val: string) => {
    setText(val);
    if (!onTyping) return;
    if (val.trim()) {
      if (!typingRef.current) { typingRef.current = true; onTyping(true); }
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      stopTimerRef.current = setTimeout(() => {
        typingRef.current = false;
        onTyping(false);
      }, 2500);
    } else {
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      if (typingRef.current) { typingRef.current = false; onTyping(false); }
    }
  }, [onTyping]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const txt = text.trim();
    if (!txt) return;
    onSend(txt);
    setText('');
    if (onTyping && typingRef.current) {
      typingRef.current = false;
      onTyping(false);
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    }
  }

  const typingLabel = typingUsers.length === 1
    ? t.typing1(typingUsers[0].userName)
    : typingUsers.length === 2
      ? t.typing2(typingUsers[0].userName, typingUsers[1].userName)
      : typingUsers.length > 2
        ? t.typingMany(typingUsers.length)
        : null;

  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {messages.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-6">{t.noMessages}</p>
        ) : (
          messages.map((m) => {
            if (m.user_id === 'system') {
              return <p key={m.id} className="text-[11px] text-gray-500 italic text-center">{m.text}</p>;
            }
            const mine = m.user_id === myId;
            return (
              <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                {!mine && <span className="text-[10px] text-gray-400 px-2 mb-0.5">{m.user_name}</span>}
                <div className={`max-w-[80%] px-3 py-1.5 rounded-2xl text-sm break-words
                  ${mine ? 'bg-brand text-white rounded-br-sm' : 'bg-gray-800 text-gray-100 rounded-bl-sm'}`}>
                  {m.text}
                </div>
              </div>
            );
          })
        )}

        {typingLabel && (
          <div className="flex items-center gap-2 px-1">
            <div className="flex items-center gap-0.5 bg-gray-800 px-3 py-2 rounded-2xl rounded-bl-sm">
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
            </div>
            <span className="text-[11px] text-gray-500">{typingLabel}</span>
          </div>
        )}
      </div>

      <form onSubmit={submit} className="flex items-center gap-2 px-3 py-2 border-t border-gray-800 bg-gray-950">
        <input
          type="text" value={text}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={t.chatPlaceholder}
          maxLength={500}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-full px-4 py-2 text-sm text-white
                     placeholder-gray-500 outline-none focus:border-brand"
        />
        <button
          type="submit" disabled={!text.trim()} aria-label="Send"
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
