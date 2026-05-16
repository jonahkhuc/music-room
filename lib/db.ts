/**
 * Data layer with automatic fallback:
 *   - DATABASE_URL set  → PostgreSQL (production)
 *   - DATABASE_URL unset → in-memory store (mock / dev without DB)
 *
 * Both implementations share the same function signatures, so the rest of
 * the codebase never needs to know which backend is active.
 */

import type { Room, RoomUser, Song, QueueItem } from '../types';

// ─── tiny UUID-like generator (no external dep) ───────────────────────────────
function uid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// IN-MEMORY STORE
// Stored on `global` so the same Maps are shared across Next.js module
// instances (API routes bundle separately from the custom server).
// ─────────────────────────────────────────────────────────────────────────────

const g = global as any;
if (!g.__musicRoomDB) {
  g.__musicRoomDB = {
    rooms: new Map<string, Room>(),
    users: new Map<string, RoomUser>(),
    songs: new Map<string, Song>(),
    queue: new Map<string, QueueItem>(),
  };
}

const _rooms: Map<string, Room>      = g.__musicRoomDB.rooms;
const _users: Map<string, RoomUser>  = g.__musicRoomDB.users;
const _songs: Map<string, Song>      = g.__musicRoomDB.songs;
const _queue: Map<string, QueueItem> = g.__musicRoomDB.queue;

const mem = {
  async createRoom(
    name: string,
    code: string,
    opts: { visibility?: 'public' | 'private'; is_default?: boolean } = {},
  ): Promise<Room> {
    const room: Room = {
      id: uid(),
      code,
      name,
      host_id: null,
      created_at: new Date().toISOString(),
      visibility: opts.visibility ?? 'public',
      is_default: opts.is_default ?? false,
    };
    _rooms.set(room.id, room);
    return room;
  },

  async getRoomByCode(code: string): Promise<Room | null> {
    for (const r of Array.from(_rooms.values())) {
      if (r.code === code) return r;
    }
    return null;
  },

  async listRooms(): Promise<Room[]> {
    return Array.from(_rooms.values()).sort((a, b) => {
      if (a.is_default && !b.is_default) return -1;
      if (!a.is_default && b.is_default) return 1;
      return a.created_at.localeCompare(b.created_at);
    });
  },

  async updateRoomHost(roomId: string, hostId: string): Promise<void> {
    const r = _rooms.get(roomId);
    if (r) _rooms.set(roomId, { ...r, host_id: hostId });
  },

  async createUser(data: { room_id: string; name: string; socket_id: string; is_host: boolean }): Promise<RoomUser> {
    const user: RoomUser = {
      id: uid(), room_id: data.room_id, name: data.name,
      socket_id: data.socket_id, is_host: data.is_host,
      joined_at: new Date().toISOString(),
    };
    _users.set(user.id, user);
    return user;
  },

  async getRoomUsers(roomId: string): Promise<RoomUser[]> {
    return Array.from(_users.values())
      .filter((u) => u.room_id === roomId)
      .sort((a, b) => a.joined_at.localeCompare(b.joined_at));
  },

  async removeUser(userId: string): Promise<void> {
    _users.delete(userId);
  },

  async promoteUserToHost(userId: string, roomId: string): Promise<void> {
    for (const u of Array.from(_users.values())) {
      if (u.room_id === roomId) {
        _users.set(u.id, { ...u, is_host: u.id === userId });
      }
    }
  },

  async upsertSong(song: Omit<Song, 'id'>): Promise<Song> {
    const key = `${song.source}:${song.source_id}`;
    const existing = _songs.get(key);
    if (existing) {
      const updated = { ...existing, ...song };
      _songs.set(key, updated);
      return updated;
    }
    const saved: Song = { id: uid(), ...song };
    _songs.set(key, saved);
    return saved;
  },

  async addToQueue(data: { room_id: string; song_id: string; added_by: string }): Promise<QueueItem> {
    const existing = Array.from(_queue.values()).filter((q) => q.room_id === data.room_id);
    const position = existing.length === 0 ? 1 : Math.max(...existing.map((q) => q.position)) + 1;

    const item: QueueItem = {
      id: uid(), room_id: data.room_id, song_id: data.song_id,
      position, added_by: data.added_by,
      added_at: new Date().toISOString(), played_at: null,
    };
    _queue.set(item.id, item);
    return item;
  },

  async getRoomQueue(roomId: string): Promise<QueueItem[]> {
    // Find song by id helper
    const songById = (id: string): Song | undefined =>
      Array.from(_songs.values()).find((s) => s.id === id);

    return Array.from(_queue.values())
      .filter((q) => q.room_id === roomId)
      .sort((a, b) => a.position - b.position)
      .map((q) => ({ ...q, song: songById(q.song_id) }));
  },

  async markSongPlayed(queueItemId: string): Promise<void> {
    const item = _queue.get(queueItemId);
    if (item) _queue.set(queueItemId, { ...item, played_at: new Date().toISOString() });
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// POSTGRES STORE
// ─────────────────────────────────────────────────────────────────────────────

// Lazily import pg so the app doesn't crash when pg isn't configured
async function getPool() {
  const { Pool } = await import('pg');
  return new Pool({ connectionString: process.env.DATABASE_URL });
}

let _pool: import('pg').Pool | null = null;
async function pool() {
  if (!_pool) _pool = await getPool();
  return _pool;
}

const pg = {
  async createRoom(
    name: string,
    code: string,
    opts: { visibility?: 'public' | 'private'; is_default?: boolean } = {},
  ): Promise<Room> {
    const db = await pool();
    const { rows } = await db.query<Room>(
      `INSERT INTO rooms (name, code, visibility, is_default)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, code, opts.visibility ?? 'public', opts.is_default ?? false],
    );
    return rows[0];
  },

  async getRoomByCode(code: string): Promise<Room | null> {
    const db = await pool();
    const { rows } = await db.query<Room>('SELECT * FROM rooms WHERE code = $1', [code]);
    return rows[0] ?? null;
  },

  async listRooms(): Promise<Room[]> {
    const db = await pool();
    const { rows } = await db.query<Room>(
      'SELECT * FROM rooms ORDER BY is_default DESC, created_at ASC',
    );
    return rows;
  },

  async updateRoomHost(roomId: string, hostId: string): Promise<void> {
    const db = await pool();
    await db.query('UPDATE rooms SET host_id = $1 WHERE id = $2', [hostId, roomId]);
  },

  async createUser(data: { room_id: string; name: string; socket_id: string; is_host: boolean }): Promise<RoomUser> {
    const db = await pool();
    const { rows } = await db.query<RoomUser>(
      'INSERT INTO room_users (room_id, name, socket_id, is_host) VALUES ($1, $2, $3, $4) RETURNING *',
      [data.room_id, data.name, data.socket_id, data.is_host],
    );
    return rows[0];
  },

  async getRoomUsers(roomId: string): Promise<RoomUser[]> {
    const db = await pool();
    const { rows } = await db.query<RoomUser>(
      'SELECT * FROM room_users WHERE room_id = $1 ORDER BY joined_at', [roomId],
    );
    return rows;
  },

  async removeUser(userId: string): Promise<void> {
    const db = await pool();
    await db.query('DELETE FROM room_users WHERE id = $1', [userId]);
  },

  async promoteUserToHost(userId: string, roomId: string): Promise<void> {
    const db = await pool();
    await db.query('UPDATE room_users SET is_host = FALSE WHERE room_id = $1', [roomId]);
    await db.query('UPDATE room_users SET is_host = TRUE  WHERE id = $1',      [userId]);
  },

  async upsertSong(song: Omit<Song, 'id'>): Promise<Song> {
    const db = await pool();
    const { rows } = await db.query<Song>(
      `INSERT INTO songs (source, source_id, title, thumbnail, duration, channel)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (source, source_id) DO UPDATE
         SET title = EXCLUDED.title, thumbnail = EXCLUDED.thumbnail,
             duration = EXCLUDED.duration, channel = EXCLUDED.channel
       RETURNING *`,
      [song.source, song.source_id, song.title, song.thumbnail, song.duration, song.channel],
    );
    return rows[0];
  },

  async addToQueue(data: { room_id: string; song_id: string; added_by: string }): Promise<QueueItem> {
    const db = await pool();
    const { rows: pos } = await db.query<{ next_pos: number }>(
      `SELECT COALESCE(MAX(position), 0) + 1 AS next_pos
       FROM queue_items WHERE room_id = $1`, [data.room_id],
    );
    const { rows } = await db.query<QueueItem>(
      'INSERT INTO queue_items (room_id, song_id, position, added_by) VALUES ($1, $2, $3, $4) RETURNING *',
      [data.room_id, data.song_id, pos[0].next_pos, data.added_by],
    );
    return rows[0];
  },

  async getRoomQueue(roomId: string): Promise<QueueItem[]> {
    const db = await pool();
    const { rows } = await db.query(
      `SELECT qi.id, qi.room_id, qi.song_id, qi.position, qi.added_by, qi.added_at, qi.played_at,
              s.source, s.source_id, s.title, s.thumbnail, s.duration, s.channel
       FROM queue_items qi JOIN songs s ON s.id = qi.song_id
       WHERE qi.room_id = $1 ORDER BY qi.position`,
      [roomId],
    );
    return rows.map((r) => ({
      id: r.id, room_id: r.room_id, song_id: r.song_id,
      position: r.position, added_by: r.added_by, added_at: r.added_at, played_at: r.played_at,
      song: { id: r.song_id, source: r.source, source_id: r.source_id, title: r.title,
              thumbnail: r.thumbnail, duration: r.duration, channel: r.channel } satisfies Song,
    }));
  },

  async markSongPlayed(queueItemId: string): Promise<void> {
    const db = await pool();
    await db.query('UPDATE queue_items SET played_at = NOW() WHERE id = $1', [queueItemId]);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API — auto-selects backend
// ─────────────────────────────────────────────────────────────────────────────

const backend = process.env.DATABASE_URL ? pg : mem;

if (!process.env.DATABASE_URL) {
  console.log('[db] DATABASE_URL not set — using in-memory store (data resets on restart)');
}

export const createRoom       = backend.createRoom.bind(backend);
export const getRoomByCode    = backend.getRoomByCode.bind(backend);
export const listRooms        = backend.listRooms.bind(backend);
export const updateRoomHost   = backend.updateRoomHost.bind(backend);
export const createUser       = backend.createUser.bind(backend);
export const getRoomUsers     = backend.getRoomUsers.bind(backend);
export const removeUser       = backend.removeUser.bind(backend);
export const promoteUserToHost = backend.promoteUserToHost.bind(backend);
export const upsertSong       = backend.upsertSong.bind(backend);
export const addToQueue       = backend.addToQueue.bind(backend);
export const getRoomQueue     = backend.getRoomQueue.bind(backend);
export const markSongPlayed   = backend.markSongPlayed.bind(backend);

// ─── Default "Lobby" room ────────────────────────────────────────────────────
// Always ensure a public, no-approval-required room exists so users can test
// the core features without permission to create one.
export const DEFAULT_ROOM_CODE = 'LOBBY';

export async function ensureDefaultRoom(): Promise<Room> {
  const existing = await backend.getRoomByCode(DEFAULT_ROOM_CODE);
  if (existing) return existing;
  return backend.createRoom('Lobby', DEFAULT_ROOM_CODE, {
    visibility: 'public',
    is_default: true,
  });
}
