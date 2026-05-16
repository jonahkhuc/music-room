import type { Room, RoomUser, Song, QueueItem } from '../types';

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Store on `global` so the same Maps are shared across Next.js module instances
// (API routes bundle separately from the custom server).
const g = global as any;
if (!g.__musicRoomDB) {
  g.__musicRoomDB = {
    rooms: new Map<string, Room>(),
    users: new Map<string, RoomUser>(),
    songs: new Map<string, Song>(),
    queue: new Map<string, QueueItem>(),
  };
}

const rooms: Map<string, Room>      = g.__musicRoomDB.rooms;
const users: Map<string, RoomUser>  = g.__musicRoomDB.users;
const songs: Map<string, Song>      = g.__musicRoomDB.songs;
const queue: Map<string, QueueItem> = g.__musicRoomDB.queue;

export async function createRoom(
  name: string,
  code: string,
  opts: { visibility?: 'public' | 'private'; is_default?: boolean } = {},
): Promise<Room> {
  const room: Room = {
    id: uid(), code, name, host_id: null,
    created_at: new Date().toISOString(),
    visibility: opts.visibility ?? 'public',
    is_default: opts.is_default ?? false,
  };
  rooms.set(room.id, room);
  return room;
}

export async function getRoomByCode(code: string): Promise<Room | null> {
  for (const r of rooms.values()) {
    if (r.code === code) return r;
  }
  return null;
}

export async function listRooms(): Promise<Room[]> {
  return [...rooms.values()].sort((a, b) => {
    if (a.is_default && !b.is_default) return -1;
    if (!a.is_default && b.is_default) return 1;
    return a.created_at.localeCompare(b.created_at);
  });
}

export async function updateRoomHost(roomId: string, hostId: string): Promise<void> {
  const r = rooms.get(roomId);
  if (r) rooms.set(roomId, { ...r, host_id: hostId });
}

export async function createUser(data: {
  room_id: string; name: string; socket_id: string; is_host: boolean;
}): Promise<RoomUser> {
  const user: RoomUser = {
    id: uid(), room_id: data.room_id, name: data.name,
    socket_id: data.socket_id, is_host: data.is_host,
    joined_at: new Date().toISOString(),
  };
  users.set(user.id, user);
  return user;
}

export async function getRoomUsers(roomId: string): Promise<RoomUser[]> {
  return [...users.values()]
    .filter((u) => u.room_id === roomId)
    .sort((a, b) => a.joined_at.localeCompare(b.joined_at));
}

export async function removeUser(userId: string): Promise<void> {
  users.delete(userId);
}

export async function promoteUserToHost(userId: string, roomId: string): Promise<void> {
  for (const u of users.values()) {
    if (u.room_id === roomId) {
      users.set(u.id, { ...u, is_host: u.id === userId });
    }
  }
}

export async function upsertSong(song: Omit<Song, 'id'>): Promise<Song> {
  const key = `${song.source}:${song.source_id}`;
  const existing = songs.get(key);
  if (existing) {
    const updated = { ...existing, ...song };
    songs.set(key, updated);
    return updated;
  }
  const saved: Song = { id: uid(), ...song };
  songs.set(key, saved);
  return saved;
}

export async function addToQueue(data: {
  room_id: string; song_id: string; added_by: string;
}): Promise<QueueItem> {
  const roomItems = [...queue.values()].filter((q) => q.room_id === data.room_id);
  const position = roomItems.length === 0
    ? 1
    : Math.max(...roomItems.map((q) => q.position)) + 1;

  const item: QueueItem = {
    id: uid(), room_id: data.room_id, song_id: data.song_id,
    position, added_by: data.added_by,
    added_at: new Date().toISOString(), played_at: null,
  };
  queue.set(item.id, item);
  return item;
}

export async function getRoomQueue(roomId: string): Promise<QueueItem[]> {
  const songById = (id: string) => [...songs.values()].find((s) => s.id === id);
  return [...queue.values()]
    .filter((q) => q.room_id === roomId)
    .sort((a, b) => a.position - b.position)
    .map((q) => ({ ...q, song: songById(q.song_id) }));
}

export async function markSongPlayed(queueItemId: string): Promise<void> {
  const item = queue.get(queueItemId);
  if (item) queue.set(queueItemId, { ...item, played_at: new Date().toISOString() });
}

export const DEFAULT_ROOM_CODE = 'LOBBY';

export async function ensureDefaultRoom(): Promise<Room> {
  const existing = await getRoomByCode(DEFAULT_ROOM_CODE);
  if (existing) return existing;
  return createRoom('Lobby', DEFAULT_ROOM_CODE, { visibility: 'public', is_default: true });
}
