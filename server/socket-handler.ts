import { Server, Socket } from 'socket.io';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  RoomState,
  PlayerState,
  RoomUser,
  Song,
  ChatMessage,
  JoinRequest,
  RoomSummary,
} from '../types';
import * as db from '../lib/db';

type IO     = Server<ClientToServerEvents, ServerToClientEvents>;
type Sock   = Socket<ClientToServerEvents, ServerToClientEvents>;

// ─── In-memory state (real-time data that's too transient for DB) ──────────────

interface MemUser {
  id:        string;
  name:      string;
  socketId:  string;
  isHost:    boolean;
  roomCode:  string;
}

interface MemRoom {
  player:          PlayerState;
  hostSocketId:    string | null;
  messages:        ChatMessage[];
  joinRequests:    JoinRequest[];
  approvedSockets: Set<string>;  // sockets approved to join_room for private rooms
}

const MAX_CHAT_HISTORY = 100;

const users     = new Map<string, MemUser>();   // socketId → user
const roomCache = new Map<string, MemRoom>();   // roomCode → room state

function getOrInitRoom(code: string): MemRoom {
  if (!roomCache.has(code)) {
    roomCache.set(code, {
      player:          { current_song: null, is_playing: false, current_time: 0, updated_at: 0 },
      hostSocketId:    null,
      messages:        [],
      joinRequests:    [],
      approvedSockets: new Set(),
    });
  }
  return roomCache.get(code)!;
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function countUsersInRoom(code: string): number {
  let n = 0;
  for (const u of Array.from(users.values())) if (u.roomCode === code) n++;
  return n;
}

async function buildRoomsList(): Promise<RoomSummary[]> {
  const rooms = await db.listRooms();
  return rooms
    .filter((r) => (r.visibility ?? 'public') === 'public')
    .map((r) => ({
      code:       r.code,
      name:       r.name,
      user_count: countUsersInRoom(r.code),
      is_default: !!r.is_default,
      visibility: (r.visibility ?? 'public') as 'public' | 'private',
    }));
}

// ─── Handler setup ─────────────────────────────────────────────────────────────

export function setupSocketHandlers(io: IO) {
  // Make sure the always-on default room exists before anyone connects.
  db.ensureDefaultRoom().catch((e) => console.error('[ws] ensureDefaultRoom:', e));

  async function broadcastRoomsList() {
    try {
      const list = await buildRoomsList();
      io.emit('rooms_list', list);
    } catch (e) { console.error('[ws] broadcastRoomsList:', e); }
  }

  io.on('connection', (socket: Sock) => {
    console.log('[ws] connected:', socket.id);

    // ── list_rooms ───────────────────────────────────────────────────────────
    socket.on('list_rooms', async () => {
      try {
        const list = await buildRoomsList();
        socket.emit('rooms_list', list);
      } catch (e) {
        console.error('[ws] list_rooms:', e);
        socket.emit('error', 'Failed to list rooms');
      }
    });

    // ── request_join ─────────────────────────────────────────────────────────
    socket.on('request_join', async ({ roomCode, userName }) => {
      try {
        const code = roomCode.toUpperCase();
        const room = await db.getRoomByCode(code);
        if (!room) { socket.emit('error', 'Room not found'); return; }

        const mem = getOrInitRoom(code);

        // Public rooms and default room: auto-approve
        if (room.is_default || room.visibility !== 'private') {
          mem.approvedSockets.add(socket.id);
          socket.emit('join_request_result', { roomCode: code, approved: true });
          return;
        }

        // Private room with no host: auto-approve
        if (!mem.hostSocketId) {
          mem.approvedSockets.add(socket.id);
          socket.emit('join_request_result', { roomCode: code, approved: true });
          return;
        }

        // Private room with host: send request to host
        const req: JoinRequest = {
          id:         uid(),
          room_code:  code,
          socket_id:  socket.id,
          user_name:  userName,
          created_at: Date.now(),
        };
        mem.joinRequests.push(req);

        io.to(mem.hostSocketId).emit('join_request', req);
        io.to(mem.hostSocketId).emit('join_requests_state', mem.joinRequests);
      } catch (err) {
        console.error('[ws] request_join error:', err);
        socket.emit('error', 'Failed to request join');
      }
    });

    // ── respond_join (host only) ─────────────────────────────────────────────
    socket.on('respond_join', ({ requestId, approved }) => {
      const host = users.get(socket.id);
      if (!host || !host.isHost) return;

      const mem = roomCache.get(host.roomCode);
      if (!mem) return;

      const idx = mem.joinRequests.findIndex((r) => r.id === requestId);
      if (idx < 0) return;

      const [req] = mem.joinRequests.splice(idx, 1);
      if (approved) mem.approvedSockets.add(req.socket_id);
      io.to(req.socket_id).emit('join_request_result', {
        roomCode: req.room_code,
        approved,
      });
      io.to(socket.id).emit('join_requests_state', mem.joinRequests);
    });

    // ── join_room ────────────────────────────────────────────────────────────
    socket.on('join_room', async ({ roomCode, userName }) => {
      try {
        const code = roomCode.toUpperCase();
        const room = await db.getRoomByCode(code);
        if (!room) { socket.emit('error', 'Room not found'); return; }

        const existingUsers = await db.getRoomUsers(room.id);
        const isFirstUser   = existingUsers.length === 0;

        // Private rooms: verify the socket was approved (first user = host, always allowed)
        if (!room.is_default && room.visibility === 'private' && !isFirstUser) {
          const mem = getOrInitRoom(code);
          if (!mem.approvedSockets.has(socket.id)) {
            socket.emit('error', 'Room not found');
            return;
          }
          mem.approvedSockets.delete(socket.id);
        }

        const user = await db.createUser({
          room_id:   room.id,
          name:      userName,
          socket_id: socket.id,
          is_host:   isFirstUser,
        });

        if (isFirstUser) await db.updateRoomHost(room.id, user.id);

        users.set(socket.id, {
          id: user.id, name: userName,
          socketId: socket.id, isHost: isFirstUser, roomCode: code,
        });

        const mem = getOrInitRoom(code);
        if (isFirstUser) mem.hostSocketId = socket.id;

        socket.join(code);

        const [allUsers, queue] = await Promise.all([
          db.getRoomUsers(room.id),
          db.getRoomQueue(room.id),
        ]);

        // If queue has songs but no current song, prime the player
        if (!mem.player.current_song && queue.length > 0) {
          mem.player = { current_song: queue[0], is_playing: false, current_time: 0, updated_at: Date.now() };
        }

        // Ask the current host (if not this user) to push a fresh progress
        // tick so the new joiner gets the most accurate timestep. The host
        // will receive `sync_request` and respond with `report_progress`.
        if (!isFirstUser && mem.hostSocketId && mem.player.is_playing) {
          io.to(mem.hostSocketId).emit('player_state_changed', mem.player); // pings host
        }

        const state: RoomState = {
          room:     { ...room, host_id: isFirstUser ? user.id : room.host_id },
          users:    allUsers,
          queue,
          player:   mem.player,
          messages: [],
        };

        socket.emit('room_state', state);
        socket.to(code).emit('user_joined', user);

        // System "X joined" chat message
        const joinMsg: ChatMessage = {
          id:         uid(),
          room_code:  code,
          user_id:    'system',
          user_name:  'system',
          text:       `${userName} joined`,
          created_at: Date.now(),
        };
        mem.messages.push(joinMsg);
        if (mem.messages.length > MAX_CHAT_HISTORY) mem.messages.shift();
        io.to(code).emit('chat_message', joinMsg);

        // If this user happens to be the (new) host, also send any pending requests.
        if (isFirstUser && mem.joinRequests.length > 0) {
          socket.emit('join_requests_state', mem.joinRequests);
        }

        // Public rooms list changed (user_count updated)
        broadcastRoomsList();

        console.log(`[ws] ${userName} joined ${code}`);
      } catch (err) {
        console.error('[ws] join_room error:', err);
        socket.emit('error', 'Failed to join room');
      }
    });

    // ── send_chat ────────────────────────────────────────────────────────────
    socket.on('send_chat', (text: string) => {
      const user = users.get(socket.id);
      if (!user) return;
      const clean = (text ?? '').toString().trim().slice(0, 500);
      if (!clean) return;

      const mem = getOrInitRoom(user.roomCode);
      const msg: ChatMessage = {
        id:         uid(),
        room_code:  user.roomCode,
        user_id:    user.id,
        user_name:  user.name,
        text:       clean,
        created_at: Date.now(),
      };
      mem.messages.push(msg);
      if (mem.messages.length > MAX_CHAT_HISTORY) mem.messages.shift();
      io.to(user.roomCode).emit('chat_message', msg);
    });

    // ── add_song ─────────────────────────────────────────────────────────────
    socket.on('add_song', async (songData: Omit<Song, 'id'>) => {
      const user = users.get(socket.id);
      if (!user) return;

      try {
        const room = await db.getRoomByCode(user.roomCode);
        if (!room) return;

        const song      = await db.upsertSong(songData);
        await db.addToQueue({ room_id: room.id, song_id: song.id, added_by: user.name });

        const queue = await db.getRoomQueue(room.id);

        const mem = getOrInitRoom(user.roomCode);
        if (!mem.player.current_song && queue.length > 0) {
          mem.player = { current_song: queue[0], is_playing: false, current_time: 0, updated_at: Date.now() };
          io.to(user.roomCode).emit('player_state_changed', mem.player);
        }

        io.to(user.roomCode).emit('queue_updated', queue);
      } catch (err) {
        console.error('[ws] add_song error:', err);
        socket.emit('error', 'Failed to add song');
      }
    });

    // ── next_song (host only) ────────────────────────────────────────────────
    socket.on('next_song', async () => {
      const user = users.get(socket.id);
      if (!user || !user.isHost) return;
      try {
        const room = await db.getRoomByCode(user.roomCode);
        if (!room) return;

        const queue = await db.getRoomQueue(room.id);
        const mem   = getOrInitRoom(user.roomCode);
        const idx   = mem.player.current_song
          ? queue.findIndex((q) => q.id === mem.player.current_song!.id)
          : -1;
        const next  = queue[idx + 1] ?? null;

        mem.player = {
          current_song: next,
          is_playing:   next !== null,
          current_time: 0,
          updated_at:   Date.now(),
        };
        io.to(user.roomCode).emit('player_state_changed', mem.player);
      } catch (err) { console.error('[ws] next_song error:', err); }
    });

    // ── prev_song (host only) ────────────────────────────────────────────────
    socket.on('prev_song', async () => {
      const user = users.get(socket.id);
      if (!user || !user.isHost) return;
      try {
        const room = await db.getRoomByCode(user.roomCode);
        if (!room) return;

        const queue = await db.getRoomQueue(room.id);
        const mem   = getOrInitRoom(user.roomCode);
        const idx   = mem.player.current_song
          ? queue.findIndex((q) => q.id === mem.player.current_song!.id)
          : 0;
        const prev  = queue[Math.max(0, idx - 1)] ?? null;

        mem.player = {
          current_song: prev,
          is_playing:   prev !== null,
          current_time: 0,
          updated_at:   Date.now(),
        };
        io.to(user.roomCode).emit('player_state_changed', mem.player);
      } catch (err) { console.error('[ws] prev_song error:', err); }
    });

    // ── play_song (host only) ────────────────────────────────────────────────
    socket.on('play_song', async (queueItemId: string) => {
      const user = users.get(socket.id);
      if (!user || !user.isHost) return;
      try {
        const room = await db.getRoomByCode(user.roomCode);
        if (!room) return;

        const queue  = await db.getRoomQueue(room.id);
        const target = queue.find((q) => q.id === queueItemId);
        if (!target) return;

        const mem = getOrInitRoom(user.roomCode);
        mem.player = {
          current_song: target,
          is_playing:   true,
          current_time: 0,
          updated_at:   Date.now(),
        };
        io.to(user.roomCode).emit('player_state_changed', mem.player);
      } catch (err) { console.error('[ws] play_song error:', err); }
    });

    // ── toggle_play (host only) ──────────────────────────────────────────────
    socket.on('toggle_play', (isPlaying: boolean) => {
      const user = users.get(socket.id);
      if (!user || !user.isHost) return;
      const mem = getOrInitRoom(user.roomCode);
      if (!mem.player.current_song) return;
      mem.player = { ...mem.player, is_playing: isPlaying, updated_at: Date.now() };
      io.to(user.roomCode).emit('player_state_changed', mem.player);
    });

    // ── seek (host only) ─────────────────────────────────────────────────────
    socket.on('seek', (seconds: number) => {
      const user = users.get(socket.id);
      if (!user || !user.isHost) return;

      const mem = getOrInitRoom(user.roomCode);
      if (!mem.player.current_song) return;

      mem.player = { ...mem.player, current_time: seconds, updated_at: Date.now() };
      io.to(user.roomCode).emit('player_state_changed', mem.player);
    });

    // ── report_progress (host only) ──────────────────────────────────────────
    // Lightweight tick from the host so the server always has a fresh
    // current_time + updated_at. We DON'T broadcast it (would be chatty);
    // it only matters when a new user joins and needs a synced timestep.
    socket.on('report_progress', (seconds: number) => {
      const user = users.get(socket.id);
      if (!user || !user.isHost) return;
      const mem = roomCache.get(user.roomCode);
      if (!mem || !mem.player.current_song) return;
      mem.player = { ...mem.player, current_time: seconds, updated_at: Date.now() };
    });

    // ── set_visibility (host only) ────────────────────────────────────────────
    socket.on('set_visibility', async (visibility) => {
      const user = users.get(socket.id);
      if (!user) { console.warn('[ws] set_visibility: no user for socket', socket.id); return; }
      if (!user.isHost) { console.warn('[ws] set_visibility: not host', user.name); return; }
      try {
        const room = await db.getRoomByCode(user.roomCode);
        if (!room) { console.warn('[ws] set_visibility: room not found', user.roomCode); return; }
        await db.updateRoomVisibility(room.id, visibility);
        io.to(user.roomCode).emit('room_updated', { ...room, visibility });
        broadcastRoomsList();
        console.log(`[ws] ${user.name} set ${user.roomCode} visibility → ${visibility}`);
      } catch (err) { console.error('[ws] set_visibility error:', err); }
    });

    // ── typing ────────────────────────────────────────────────────────────────
    socket.on('typing_start', () => {
      const user = users.get(socket.id);
      if (!user) return;
      socket.to(user.roomCode).emit('user_typing', { userId: user.id, userName: user.name, isTyping: true });
    });

    socket.on('typing_stop', () => {
      const user = users.get(socket.id);
      if (!user) return;
      socket.to(user.roomCode).emit('user_typing', { userId: user.id, userName: user.name, isTyping: false });
    });

    // ── sync_request ──────────────────────────────────────────────────────────
    socket.on('sync_request', () => {
      const user = users.get(socket.id);
      if (!user) return;
      const mem = roomCache.get(user.roomCode);
      if (mem) socket.emit('player_state_changed', mem.player);
    });

    // ── disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      const user = users.get(socket.id);
      if (!user) {
        // Clean up any pending join requests or approvals for this socket
        for (const mem of Array.from(roomCache.values())) {
          mem.approvedSockets.delete(socket.id);
          const before = mem.joinRequests.length;
          mem.joinRequests = mem.joinRequests.filter((r) => r.socket_id !== socket.id);
          if (mem.joinRequests.length !== before && mem.hostSocketId) {
            io.to(mem.hostSocketId).emit('join_requests_state', mem.joinRequests);
          }
        }
        return;
      }
      users.delete(socket.id);
      socket.to(user.roomCode).emit('user_typing', { userId: user.id, userName: user.name, isTyping: false });

      try {
        await db.removeUser(user.id);
        io.to(user.roomCode).emit('user_left', user.id);

        const mem = roomCache.get(user.roomCode);
        if (mem) {
          // System "left" chat
          const leftMsg: ChatMessage = {
            id:         uid(),
            room_code:  user.roomCode,
            user_id:    'system',
            user_name:  'system',
            text:       `${user.name} left`,
            created_at: Date.now(),
          };
          mem.messages.push(leftMsg);
          if (mem.messages.length > MAX_CHAT_HISTORY) mem.messages.shift();
          io.to(user.roomCode).emit('chat_message', leftMsg);

          // If host left, promote the next user
          if (user.isHost) {
            let newHost: MemUser | null = null;
            for (const u of Array.from(users.values())) {
              if (u.roomCode === user.roomCode) { newHost = u; break; }
            }

            if (newHost) {
              newHost.isHost    = true;
              mem.hostSocketId  = newHost.socketId;

              const room = await db.getRoomByCode(user.roomCode);
              if (room) {
                await db.promoteUserToHost(newHost.id, room.id);
                await db.updateRoomHost(room.id, newHost.id);

                const [allUsers, queue] = await Promise.all([
                  db.getRoomUsers(room.id),
                  db.getRoomQueue(room.id),
                ]);
                const state: RoomState = {
                  room: { ...room, host_id: newHost.id },
                  users: allUsers, queue,
                  player: mem.player,
                  messages: mem.messages,
                };
                io.to(user.roomCode).emit('room_state', state);
              }
            } else {
              // Room is empty – drop transient state, but keep default room cache key.
              if (user.roomCode !== db.DEFAULT_ROOM_CODE) {
                roomCache.delete(user.roomCode);
              } else {
                // Reset default room player/messages so it's "fresh" for next visitor
                mem.player = { current_song: null, is_playing: false, current_time: 0, updated_at: 0 };
                mem.messages = [];
                mem.hostSocketId = null;
                mem.joinRequests = [];
              }
            }
          }
        }

        broadcastRoomsList();
      } catch (err) {
        console.error('[ws] disconnect error:', err);
      }

      console.log(`[ws] ${user.name} left ${user.roomCode}`);
    });
  });
}
