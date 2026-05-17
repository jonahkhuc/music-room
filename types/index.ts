// ─── Domain models ────────────────────────────────────────────────────────────

export interface Room {
  id: string;
  code: string;
  name: string;
  host_id: string | null;
  created_at: string;
  /** Visibility: 'public' is listed on the home page; 'private' is hidden */
  visibility?: 'public' | 'private';
  /** True if no approval is required to join (e.g. the default Lobby) */
  is_default?: boolean;
}

export interface RoomUser {
  id: string;
  room_id: string;
  name: string;
  socket_id: string | null;
  is_host: boolean;
  joined_at: string;
}

/** Extensible song model – source field enables future providers (Spotify, etc.) */
export interface Song {
  id: string;
  source: 'youtube' | string;   // e.g. 'spotify' later
  source_id: string;             // youtube video ID, spotify track ID …
  title: string;
  thumbnail: string | null;
  duration: string | null;       // human-readable, e.g. "3:45"
  channel: string | null;
}

export interface QueueItem {
  id: string;
  room_id: string;
  song_id: string;
  position: number;
  added_by: string | null;
  added_at: string;
  played_at: string | null;
  song?: Song;
}

export interface PlayerState {
  current_song: QueueItem | null;
  is_playing: boolean;
  current_time: number;   // seconds (best-effort; not persisted to DB)
  updated_at: number;     // epoch ms – used to detect stale broadcasts
}

export interface ChatMessage {
  id: string;
  room_code: string;
  user_id: string;       // ephemeral user id (or 'system')
  user_name: string;
  text: string;
  created_at: number;    // epoch ms
}

export interface JoinRequest {
  id: string;
  room_code: string;
  socket_id: string;     // requester socket – needed to notify back
  user_name: string;
  created_at: number;
}

/** Public-facing room info used on the home page */
export interface RoomSummary {
  code: string;
  name: string;
  user_count: number;
  is_default: boolean;
  visibility: 'public' | 'private';
}

export interface RoomState {
  room: Room;
  users: RoomUser[];
  queue: QueueItem[];
  player: PlayerState;
  messages: ChatMessage[];
}

// ─── Socket event contracts ────────────────────────────────────────────────────

export interface ServerToClientEvents {
  room_state:           (state: RoomState) => void;
  user_joined:          (user: RoomUser) => void;
  user_left:            (userId: string) => void;
  queue_updated:        (queue: QueueItem[]) => void;
  player_state_changed: (state: PlayerState) => void;
  host_changed:         (newHostId: string) => void;
  chat_message:         (msg: ChatMessage) => void;
  rooms_list:           (rooms: RoomSummary[]) => void;
  join_request:         (req: JoinRequest) => void;             // → host only
  join_requests_state:  (reqs: JoinRequest[]) => void;          // → host only
  join_request_result:  (data: { roomCode: string; approved: boolean }) => void; // → requester
  user_typing:          (data: { userId: string; userName: string; isTyping: boolean }) => void;
  room_updated:         (room: Room) => void;
  error:                (message: string) => void;
}

export interface ClientToServerEvents {
  join_room:           (data: { roomCode: string; userName: string }) => void;
  leave_room:          () => void;
  add_song:            (song: Omit<Song, 'id'>) => void;
  next_song:           () => void;
  prev_song:           () => void;
  play_song:           (queueItemId: string) => void;
  toggle_play:         (isPlaying: boolean) => void;
  seek:                (seconds: number) => void;
  sync_request:        () => void;
  send_chat:           (text: string) => void;
  /** Host-only: periodically reports its YouTube currentTime so new joiners sync */
  report_progress:     (seconds: number) => void;
  list_rooms:          () => void;
  request_join:        (data: { roomCode: string; userName: string }) => void;
  respond_join:        (data: { requestId: string; approved: boolean }) => void;
  typing_start:        () => void;
  typing_stop:         () => void;
  set_visibility:      (visibility: 'public' | 'private') => void;
}

// ─── API payloads ──────────────────────────────────────────────────────────────

export interface CreateRoomPayload {
  name: string;
  visibility?: 'public' | 'private';
}

export interface CreateRoomResponse {
  room: Room;
}

export interface SearchResult {
  source_id: string;
  source: string;
  title: string;
  thumbnail: string;
  duration: string | null;
  channel: string;
}
