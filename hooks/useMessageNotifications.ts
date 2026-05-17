'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@/types';

const ICON = '/icon-192.png';

/**
 * Side-effects for new chat messages:
 *   - play a short "ping" via WebAudio (no asset shipped)
 *   - fire an OS Notification when the tab is unfocused
 *   - track an unread badge count, cleared when chat becomes visible
 *
 * System messages (join/leave) and messages from `myId` are ignored.
 * The initial batch loaded via `room_state` is silently marked as read
 * so users don't get pinged for history when they join.
 */
export function useMessageNotifications({
  messages,
  myId,
  isChatVisible,
}: {
  messages:      ChatMessage[];
  myId:          string | null;
  isChatVisible: boolean;
}) {
  const [unreadCount, setUnreadCount] = useState(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const prevLenRef  = useRef(0);
  const seenInitRef = useRef(false);

  // Ask for OS notification permission once.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Clear unread immediately when chat becomes visible.
  useEffect(() => {
    if (isChatVisible) setUnreadCount(0);
  }, [isChatVisible]);

  // Detect new messages on each render.
  useEffect(() => {
    const newLen = messages.length;

    // First time we see messages: prime the baseline, don't notify.
    if (!seenInitRef.current) {
      seenInitRef.current = true;
      prevLenRef.current  = newLen;
      return;
    }

    if (newLen <= prevLenRef.current) {
      prevLenRef.current = newLen;
      return;
    }

    const fresh = messages.slice(prevLenRef.current).filter(
      (m) => m.user_id !== 'system' && m.user_id !== myId,
    );
    prevLenRef.current = newLen;
    if (fresh.length === 0) return;

    if (isChatVisible) return; // user is looking — no need to ping

    playPing(audioCtxRef);
    const last = fresh[fresh.length - 1];
    fireOsNotification(last.user_name, last.text);
    setUnreadCount((c) => c + fresh.length);
  }, [messages, myId, isChatVisible]);

  return { unreadCount };
}

function playPing(ctxRef: React.MutableRefObject<AudioContext | null>) {
  try {
    if (!ctxRef.current) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return;
      ctxRef.current = new Ctor();
    }
    const ctx = ctxRef.current;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const now = ctx.currentTime;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain).connect(ctx.destination);

    osc.type = 'sine';
    // Quick two-note chirp: 880Hz → 1320Hz
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.1);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

    osc.start(now);
    osc.stop(now + 0.28);
  } catch {
    /* AudioContext blocked or unsupported — silent fallback */
  }
}

function fireOsNotification(name: string, text: string) {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible' && document.hasFocus()) return;
  try {
    new Notification(name, { body: text, icon: ICON, silent: true });
  } catch {
    /* some browsers throw on construct in unsupported contexts */
  }
}
