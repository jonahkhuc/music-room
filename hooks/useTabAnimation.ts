import { useEffect, useRef } from 'react';

const STATIC_FAVICON = '/icon-192.png';
const BRAND = '#7C3AED';
const BRAND_LIGHT = '#A78BFA';
const FRAME_MS = 180;

/**
 * Animate the browser tab while music plays: canvas-drawn equalizer favicon
 * and a "♪ <song> — <room>" title. Restores both when paused/unmounted.
 */
export function useTabAnimation({
  isPlaying,
  songTitle,
  roomName,
}: {
  isPlaying: boolean;
  songTitle?: string | null;
  roomName?: string | null;
}) {
  const originalTitleRef = useRef<string | null>(null);
  const linkRef = useRef<HTMLLinkElement | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    if (originalTitleRef.current === null) {
      originalTitleRef.current = document.title;
    }
    let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    linkRef.current = link;

    if (!isPlaying) {
      link.href = STATIC_FAVICON;
      document.title = originalTitleRef.current ?? 'Music Room';
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const baseTitle = [songTitle, roomName].filter(Boolean).join(' — ') ||
                      (originalTitleRef.current ?? 'Music Room');

    let frame = 0;
    let timer: ReturnType<typeof setInterval> | null = null;

    const draw = () => {
      ctx.clearRect(0, 0, 32, 32);

      const grad = ctx.createLinearGradient(0, 0, 0, 32);
      grad.addColorStop(0, BRAND_LIGHT);
      grad.addColorStop(1, BRAND);
      ctx.fillStyle = grad;

      const bars = 4;
      const gap = 2;
      const totalGap = gap * (bars + 1);
      const barW = (32 - totalGap) / bars;
      for (let i = 0; i < bars; i++) {
        const phase = frame * 0.6 + i * 1.3;
        const h = 8 + Math.abs(Math.sin(phase)) * 20;
        const x = gap + i * (barW + gap);
        const y = 32 - h - 2;
        ctx.fillRect(x, y, barW, h);
      }

      link.href = canvas.toDataURL('image/png');
      document.title = baseTitle;
      frame++;
    };

    draw();
    timer = setInterval(draw, FRAME_MS);

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isPlaying, songTitle, roomName]);

  useEffect(() => {
    return () => {
      if (linkRef.current) linkRef.current.href = STATIC_FAVICON;
      if (originalTitleRef.current !== null) document.title = originalTitleRef.current;
    };
  }, []);
}
