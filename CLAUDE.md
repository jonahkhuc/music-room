# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # start dev server (tsx server.ts) on PORT from .env (default 3000)
npm run build      # next build
npm run start      # production server
npm run lint       # eslint
npx tsc --noEmit   # type-check without emitting
```

## Architecture

This is a **real-time music listening app** where users join rooms and watch YouTube videos in sync.

### Server entry point

`server.ts` creates a single HTTP server that handles both **Next.js** (via `next()`) and **Socket.io** on the same port. There is no separate backend — everything runs in one Node.js process.

### Data storage

All data lives in **RAM only** (no database). `lib/db.ts` holds four `Map`s (rooms, users, songs, queue) attached to `global.__musicRoomDB`. The `global` is critical — Next.js API routes and the custom server bundle `lib/db` separately, so without `global` they'd each get their own empty Maps and room lookups would fail across the boundary.

### Real-time layer

`server/socket-handler.ts` owns all socket events. It maintains two additional in-memory Maps of its own:
- `users` (socketId → user info) — who is connected right now
- `roomCache` (roomCode → player state, chat history, join requests)

These are separate from `lib/db`'s Maps: `lib/db` tracks persistent room/user records; `roomCache` tracks transient real-time state (current song, playback position, chat).

### Room creation flow

1. `POST /api/rooms` → creates room record in `lib/db` → returns room code
2. Client navigates to `/room/[code]`
3. Socket connects → emits `join_room` → socket handler looks up room in `lib/db` → sets up player state in `roomCache`

If the room exists in the API bundle's Map but not the socket handler's Map, it means the `global.__musicRoomDB` pattern is broken.

### Host model

The first user to `join_room` becomes host. When host disconnects, the next user in the room is promoted automatically. Only the host can: play/pause, seek, skip, approve join requests.

### Join request flow (non-default rooms)

Client emits `request_join` → server forwards to host via `join_request` event → host emits `respond_join` → server notifies requester via `join_request_result` → if approved, client emits `join_room`.

Default room (`LOBBY`) auto-approves everyone with no host required.

### YouTube integration

`lib/youtube.ts` has two modes:
- **URL paste**: `extractVideoId()` + `fetchVideoMeta()` via oEmbed — no API key needed
- **Keyword search**: `searchYouTube()` via YouTube Data API v3 — requires `YOUTUBE_API_KEY`

Search falls back silently to empty results when no key is set.

### Client state

`hooks/useRoom.ts` is the single source of truth on the client. It opens a Socket.io connection, handles all server events, and exposes typed action callbacks. Room page components receive state and callbacks from this hook only.

## Environment variables

```
PORT=3000                    # server port
YOUTUBE_API_KEY=             # optional; enables keyword search
NEXT_PUBLIC_APP_URL=         # public URL (used by PWA metadata)
```

## Deployment

Deployed on **Render** (free tier) via `render.yaml`. Build command uses `--include=dev` to ensure `tsx` (in devDependencies) is available. `tsx` is also in `dependencies` for the runtime start command.

Data resets on every Render restart/redeploy since storage is in-memory only.
