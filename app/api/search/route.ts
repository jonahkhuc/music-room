import { NextRequest, NextResponse } from 'next/server';
import {
  searchYouTube,
  extractVideoId,
  extractPlaylistId,
  fetchVideoMeta,
  fetchPlaylistItems,
} from '@/lib/youtube';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q) return NextResponse.json({ results: [] });

  try {
    // 1. Playlist URL (?list=PL...) → expand to all items. Falls through to
    //    single-video / search if no API key or the playlist is empty.
    const playlistId = extractPlaylistId(q);
    if (playlistId) {
      if (!process.env.YOUTUBE_API_KEY) {
        return NextResponse.json({
          results: [],
          hint: 'Set YOUTUBE_API_KEY to import playlists.',
        });
      }
      const items = await fetchPlaylistItems(playlistId);
      if (items.length > 0) {
        return NextResponse.json({
          results: items,
          playlist: { id: playlistId, count: items.length },
        });
      }
      // empty playlist → fall through to single-video handling if v= also present
    }

    // 2. Single video URL or bare ID — resolve via oEmbed (no key needed).
    const videoId = extractVideoId(q);
    if (videoId) {
      const meta = await fetchVideoMeta(videoId);
      return NextResponse.json({ results: [meta] });
    }

    // 3. Keyword search.
    if (!process.env.YOUTUBE_API_KEY) {
      return NextResponse.json({
        results: [],
        hint: 'Set YOUTUBE_API_KEY to enable keyword search. Paste a YouTube URL to add songs.',
      });
    }

    const results = await searchYouTube(q);
    return NextResponse.json({ results });
  } catch (err: any) {
    console.error('[GET /api/search]', err);
    return NextResponse.json({ error: err.message ?? 'Search failed' }, { status: 500 });
  }
}
