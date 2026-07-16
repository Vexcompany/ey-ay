-- ============================================================
-- MIGRASI DATABASE TAKSAKA AI
-- Jalankan di Supabase SQL Editor
-- ============================================================

-- 1. Tabel users (jika belum ada)
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  tipe            TEXT DEFAULT 'gratis',
  used            INTEGER DEFAULT 0,
  daily           INTEGER DEFAULT 40,
  last_reset      TIMESTAMPTZ DEFAULT now(),
  suspended       BOOLEAN DEFAULT false,
  banned          BOOLEAN DEFAULT false,
  suspend_reason  TEXT,
  suspended_at    TIMESTAMPTZ,
  avatar_url      TEXT,
  bio             TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabel members (jika belum ada)
CREATE TABLE IF NOT EXISTS members (
  id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nama      TEXT NOT NULL,
  jabatan   TEXT NOT NULL,
  generasi  INTEGER NOT NULL,
  tipe      TEXT DEFAULT 'gratis'
);

-- 3. Tabel chats (jika belum ada)
CREATE TABLE IF NOT EXISTS chats (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  role        TEXT NOT NULL,
  text        TEXT NOT NULL,
  persona     TEXT,
  session_id  TEXT,
  songs       JSONB,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chats_user_id ON chats(user_id);
CREATE INDEX IF NOT EXISTS idx_chats_created_at ON chats(created_at DESC);

-- 4. Tabel stories_chats — PENTING! Untuk Ryxa stories history
CREATE TABLE IF NOT EXISTS stories_chats (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  role        TEXT NOT NULL,
  text        TEXT NOT NULL,
  session_id  TEXT,
  audio_url   TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stories_chats_user_id ON stories_chats(user_id);
CREATE INDEX IF NOT EXISTS idx_stories_chats_created_at ON stories_chats(created_at DESC);

-- 5. Tabel announcements
CREATE TABLE IF NOT EXISTS announcements (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  type        TEXT DEFAULT 'info',
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 6. RPC untuk increment usage (atomic)
CREATE OR REPLACE FUNCTION increment_usage(uid TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE users SET used = used + 1 WHERE id = uid;
END;
$$ LANGUAGE plpgsql;

-- 7. Enable RLS (optional, sesuaikan)
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE stories_chats ENABLE ROW LEVEL SECURITY;
