/**
 * YouTube helpers.
 * Search requires YOUTUBE_API_KEY env var (YouTube Data API v3).
 * URL parsing works without a key.
 */

import type { SearchResult } from '../types';

const YT_API_BASE = 'https://www.googleapis.com/youtube/v3';

/** Convert any YouTube URL or video ID to a clean embed URL. */
export function toEmbedUrl(input: string, params: Record<string, string> = {}): string | null {
  const id = extractVideoId(input);
  if (!id) return null;
  const url = new URL(`https://www.youtube.com/embed/${id}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

/** Extract video ID from any YouTube URL format. */
export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/,
    /^([A-Za-z0-9_-]{11})$/,   // bare ID
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

/** Fetch metadata for a single video via oEmbed (no API key needed). */
export async function fetchVideoMeta(videoId: string): Promise<SearchResult> {
  const oembedUrl =
    `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
  const res = await fetch(oembedUrl);
  if (!res.ok) throw new Error(`oEmbed failed: ${res.status}`);
  const data = await res.json();
  return {
    source_id: videoId,
    source:    'youtube',
    title:     data.title ?? 'Unknown',
    thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    duration:  null,   // oEmbed doesn't return duration
    channel:   data.author_name ?? '',
  };
}

/** Search YouTube via Data API v3.  Falls back to empty array if no key. */
export async function searchYouTube(
  query: string,
  maxResults = 10,
): Promise<SearchResult[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return [];

  const url = new URL(`${YT_API_BASE}/search`);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('q', query);
  url.searchParams.set('type', 'video');
  url.searchParams.set('maxResults', String(maxResults));
  url.searchParams.set('key', key);

  const res = await fetch(url.toString());
  if (!res.ok) return [];

  const data = await res.json();
  const ids: string[] = (data.items ?? []).map((i: any) => i.id.videoId);

  // Fetch durations in a second request
  const details = await fetchVideoDetails(ids, key);

  return (data.items ?? []).map((item: any, idx: number) => ({
    source_id: item.id.videoId,
    source:    'youtube',
    title:     item.snippet.title,
    thumbnail: item.snippet.thumbnails?.medium?.url ?? '',
    duration:  details[idx] ?? null,
    channel:   item.snippet.channelTitle,
  }));
}

async function fetchVideoDetails(ids: string[], key: string): Promise<(string | null)[]> {
  if (!ids.length) return [];
  const url = new URL(`${YT_API_BASE}/videos`);
  url.searchParams.set('part', 'contentDetails');
  url.searchParams.set('id', ids.join(','));
  url.searchParams.set('key', key);

  const res = await fetch(url.toString());
  if (!res.ok) return ids.map(() => null);

  const data = await res.json();
  const map: Record<string, string> = {};
  for (const item of data.items ?? []) {
    map[item.id] = parseDuration(item.contentDetails.duration);
  }
  return ids.map((id) => map[id] ?? null);
}

/** Convert ISO 8601 duration (PT3M45S) → "3:45" */
function parseDuration(iso: string): string {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return '';
  const h = parseInt(m[1] ?? '0');
  const min = parseInt(m[2] ?? '0');
  const s = parseInt(m[3] ?? '0');
  const mm = h > 0 ? `${h}:${String(min).padStart(2, '0')}` : String(min);
  return `${mm}:${String(s).padStart(2, '0')}`;
}
