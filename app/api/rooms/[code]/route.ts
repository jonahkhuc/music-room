import { NextRequest, NextResponse } from 'next/server';
import { getRoomByCode, getRoomUsers, getRoomQueue } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: { code: string } },
) {
  try {
    const room = await getRoomByCode(params.code.toUpperCase());
    if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });

    const [users, queue] = await Promise.all([
      getRoomUsers(room.id),
      getRoomQueue(room.id),
    ]);

    return NextResponse.json({ room, users, queue });
  } catch (err) {
    console.error('[GET /api/rooms/[code]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
