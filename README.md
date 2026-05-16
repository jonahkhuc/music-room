# Music Room

> Listen to YouTube music together, in real-time sync.

## Tech Stack

| Layer      | Tech                          |
|------------|-------------------------------|
| Frontend   | Next.js 14 (App Router, TS)  |
| Realtime   | Socket.io                     |
| Database   | PostgreSQL                    |
| Music      | YouTube Iframe API            |
| Styling    | Tailwind CSS                  |
| PWA        | Web App Manifest + SW         |

---

## Quick Start

### 1. Prerequisites

- Node.js ≥ 18
- PostgreSQL running locally (or a connection string)

### 2. Install dependencies

```bash
cd music-room
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/music_room
YOUTUBE_API_KEY=      # optional – enables keyword search
PORT=3000
```

### 4. Create the database

```bash
createdb music_room          # if database doesn't exist
npm run db:migrate           # runs schema.sql
```

### 5. Run in development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 6. Production build

```bash
npm run build
npm start
```

---

## Features

### Room
- **Create** a room → get a short code (e.g. `ABC123`)
- **Join** via link or by entering the code
- One user is always the **Host** (crown icon); transfers automatically when host leaves

### Queue
- Search YouTube by **keyword** (requires `YOUTUBE_API_KEY`) or paste any **YouTube URL**
- Songs are added FIFO to the queue
- Queue updates instantly for all listeners via WebSocket

### Player
- YouTube iframe player with custom controls
- **Play / Pause** synced to all users
- Song **ends → auto-plays next** in queue
- Host gets a **Skip** button
- New joiners receive current player state immediately

---

## Socket Events

### Client → Server

| Event          | Payload                          | Description               |
|----------------|----------------------------------|---------------------------|
| `join_room`    | `{ roomCode, userName }`         | Join or create session    |
| `add_song`     | `Song` (without id)              | Add song to queue         |
| `next_song`    | —                                | Mark current played, advance |
| `toggle_play`  | `boolean`                        | Play / pause for all      |
| `seek`         | `number` (seconds)               | Host only: seek position  |
| `sync_request` | —                                | Request current state     |

### Server → Client

| Event                  | Payload            | Description                    |
|------------------------|--------------------|--------------------------------|
| `room_state`           | `RoomState`        | Full state on join / host change |
| `user_joined`          | `RoomUser`         | Someone joined                 |
| `user_left`            | `userId`           | Someone left                   |
| `queue_updated`        | `QueueItem[]`      | Queue changed                  |
| `player_state_changed` | `PlayerState`      | Play/pause/song changed        |
| `host_changed`         | `userId`           | New host assigned              |
| `error`                | `string`           | Server error message           |

---

## Database Schema

```sql
rooms        – id, code, name, host_id, created_at
room_users   – id, room_id, name, socket_id, is_host, joined_at
songs        – id, source, source_id, title, thumbnail, duration, channel
queue_items  – id, room_id, song_id, position, added_by, added_at, played_at
```

The `songs.source` / `songs.source_id` pattern makes it trivial to add **Spotify**, **SoundCloud**, or any other provider later — just add a new `source` value and a matching player component.

---

## Project Structure

```
music-room/
├── server.ts                  # Custom HTTP + Socket.io server
├── schema.sql                 # DB schema
├── types/index.ts             # Shared TS types
├── lib/
│   ├── db.ts                  # PostgreSQL queries
│   └── youtube.ts             # YouTube search + oEmbed helpers
├── server/
│   └── socket-handler.ts      # All socket event logic + in-memory state
├── hooks/
│   └── useRoom.ts             # React hook (socket lifecycle + state)
├── components/
│   ├── Player.tsx             # YouTube iframe player + controls
│   ├── Queue.tsx              # Scrollable queue list
│   ├── SearchBar.tsx          # Search / URL paste + results
│   └── UserList.tsx           # Pill badges per listener
└── app/
    ├── page.tsx               # Home – create or join room
    ├── room/[code]/page.tsx   # Room page
    └── api/
        ├── rooms/route.ts     # POST /api/rooms  (create)
        ├── rooms/[code]/route.ts  # GET /api/rooms/:code
        └── search/route.ts    # GET /api/search?q=
```

---

## Adding a new music source (e.g. Spotify)

1. Add a case in `lib/` (e.g. `lib/spotify.ts`) with search + metadata helpers
2. Update `GET /api/search` to fan-out to Spotify
3. Add a `SpotifyPlayer` component (uses Spotify Web Playback SDK)
4. In `components/Player.tsx`, switch on `playerState.current_song.song.source` to render the right player

No DB schema changes needed — `songs.source` already accommodates this.
