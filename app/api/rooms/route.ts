import { NextRequest, NextResponse } from 'next/server';
import { createRoom, listRooms, ensureDefaultRoom } from '@/lib/db';

function generateCode(len = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // remove ambiguous chars
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export async function GET() {
  try {
    // Always make sure the default room is present, then return public rooms.
    await ensureDefaultRoom();
    const rooms = await listRooms();
    const summaries = rooms
      .filter((r) => (r.visibility ?? 'public') === 'public')
      .map((r) => ({
        code:       r.code,
        name:       r.name,
        is_default: !!r.is_default,
        visibility: (r.visibility ?? 'public') as 'public' | 'private',
        // user_count is filled in over WebSocket; the HTTP route doesn't
        // know about live socket state, so we return 0 here as a baseline.
        user_count: 0,
      }));
    return NextResponse.json({ rooms: summaries });
  } catch (err) {
    console.error('[GET /api/rooms]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, visibility } = await req.json();
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Room name is required' }, { status: 400 });
    }

    const code = generateCode();
    const room = await createRoom(name.trim(), code, {
      visibility: visibility === 'private' ? 'private' : 'public',
      is_default: false,
    });
    return NextResponse.json({ room }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/rooms]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
