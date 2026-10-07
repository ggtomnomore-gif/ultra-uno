CREATE TABLE users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username VARCHAR(15) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_username_format CHECK (username ~ '^[A-Za-z0-9_]{3,15}$'),
  CONSTRAINT users_username_reserved CHECK (LOWER(username) NOT IN ('admin', 'bot', 'player', 'guest', 'uno', 'ultra')),
  CONSTRAINT users_email_format CHECK (email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);
CREATE UNIQUE INDEX users_username_ci_unique ON users (LOWER(username));

CREATE TABLE user_stats (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_mode VARCHAR(32) NOT NULL,
  mmr INTEGER NOT NULL DEFAULT 200 CHECK (mmr >= 0),
  rank VARCHAR(32) NOT NULL DEFAULT 'Bronze I',
  games_played INTEGER NOT NULL DEFAULT 0 CHECK (games_played >= 0),
  wins INTEGER NOT NULL DEFAULT 0 CHECK (wins >= 0 AND wins <= games_played),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, game_mode)
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename VARCHAR(255) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
