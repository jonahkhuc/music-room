import { NextRequest, NextResponse } from 'next/server';
import { searchYouTube, extractVideoId, fetchVideoMeta } from '@/lib/youtube';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q) return NextResponse.json({ results: [] });

  try {
    // If the query looks like a YouTube URL or bare video ID, resolve directly
    const videoId = extractVideoId(q);
    if (videoId) {
      const meta = await fetchVideoMeta(videoId);
      return NextResponse.json({ results: [meta] });
    }

    // Otherwise: keyword search via YouTube Data API v3
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
