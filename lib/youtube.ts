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

/** Extract playlist ID (list=...) from any YouTube URL. */
export function extractPlaylistId(url: string): string | null {
  const m = url.match(/[?&]list=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  const id = m[1];
  // YouTube auto-generated "Mix" playlists (RD...) aren't fetchable via the
  // public API — treat them as not-a-playlist so we fall back to the single video.
  if (id.startsWith('RD')) return null;
  return id;
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

/**
 * Fetch all items of a YouTube playlist via Data API v3.
 * Pages until empty or until `maxItems` is reached. Filters out
 * private/deleted entries. Returns empty array without an API key.
 */
export async function fetchPlaylistItems(
  playlistId: string,
  maxItems = 200,
): Promise<SearchResult[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return [];

  const collected: { videoId: string; title: string; channel: string; thumbnail: string }[] = [];
  let pageToken: string | undefined;

  while (collected.length < maxItems) {
    const url = new URL(`${YT_API_BASE}/playlistItems`);
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('playlistId', playlistId);
    url.searchParams.set('maxResults', '50');
    url.searchParams.set('key', key);
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url.toString());
    if (!res.ok) break;
    const data = await res.json();

    for (const item of data.items ?? []) {
      const snippet = item.snippet ?? {};
      const videoId = snippet.resourceId?.videoId;
      const title   = snippet.title;
      if (!videoId || !title || title === 'Private video' || title === 'Deleted video') continue;
      collected.push({
        videoId,
        title,
        channel:   snippet.videoOwnerChannelTitle ?? snippet.channelTitle ?? '',
        thumbnail: snippet.thumbnails?.medium?.url ?? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
      });
      if (collected.length >= maxItems) break;
    }

    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  const durations = await fetchVideoDetails(collected.map((c) => c.videoId), key);
  return collected.map((c, idx) => ({
    source_id: c.videoId,
    source:    'youtube',
    title:     c.title,
    thumbnail: c.thumbnail,
    duration:  durations[idx] ?? null,
    channel:   c.channel,
  }));
}

async function fetchVideoDetails(ids: string[], key: string): Promise<(string | null)[]> {
  if (!ids.length) return [];
  const map: Record<string, string> = {};
  // videos.list accepts up to 50 IDs per call — chunk for longer playlists.
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const url = new URL(`${YT_API_BASE}/videos`);
    url.searchParams.set('part', 'contentDetails');
    url.searchParams.set('id', chunk.join(','));
    url.searchParams.set('key', key);

    const res = await fetch(url.toString());
    if (!res.ok) continue;
    const data = await res.json();
    for (const item of data.items ?? []) {
      map[item.id] = parseDuration(item.contentDetails.duration);
    }
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
