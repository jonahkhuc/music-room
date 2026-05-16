-- music_room schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Rooms
CREATE TABLE IF NOT EXISTS rooms (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        VARCHAR(8)  UNIQUE NOT NULL,
  name        VARCHAR(100) NOT NULL,
  host_id     UUID,
  visibility  VARCHAR(16) DEFAULT 'public',
  is_default  BOOLEAN     DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Idempotent column additions (for upgrades from older schema)
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS visibility VARCHAR(16) DEFAULT 'public';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE;

-- Temporary users (cleaned on server restart / room expiry)
CREATE TABLE IF NOT EXISTS room_users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id     UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name        VARCHAR(50) NOT NULL,
  socket_id   VARCHAR(100),
  is_host     BOOLEAN DEFAULT FALSE,
  joined_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Song catalogue (de-duplicated by source + source_id)
-- source: 'youtube' | 'spotify' (extensible)
CREATE TABLE IF NOT EXISTS songs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source      VARCHAR(20) NOT NULL DEFAULT 'youtube',
  source_id   VARCHAR(50) NOT NULL,            -- youtube video ID, spotify track ID, etc.
  title       TEXT NOT NULL,
  thumbnail   TEXT,
  duration    VARCHAR(20),
  channel     VARCHAR(150),
  UNIQUE (source, source_id)
);

-- Queue items per room
CREATE TABLE IF NOT EXISTS queue_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id     UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  song_id     UUID NOT NULL REFERENCES songs(id),
  position    INTEGER NOT NULL,
  added_by    VARCHAR(50),
  added_at    TIMESTAMPTZ DEFAULT NOW(),
  played_at   TIMESTAMPTZ                      -- NULL = not yet played
);

CREATE INDEX IF NOT EXISTS idx_queue_room_pos   ON queue_items(room_id, position) WHERE played_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_room_users_room  ON room_users(room_id);
CREATE INDEX IF NOT EXISTS idx_rooms_code       ON rooms(code);
