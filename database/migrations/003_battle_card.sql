CREATE TABLE battle_card_seasons (
  season_id VARCHAR(40) PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  max_level INTEGER NOT NULL CHECK (max_level > 0),
  xp_per_level INTEGER NOT NULL CHECK (xp_per_level > 0),
  standard_price INTEGER NOT NULL CHECK (standard_price > 0),
  boosted_price INTEGER NOT NULL CHECK (boosted_price >= standard_price),
  active BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX battle_card_one_active_season
  ON battle_card_seasons (active) WHERE active;

CREATE TABLE battle_card_rewards (
  season_id VARCHAR(40) NOT NULL REFERENCES battle_card_seasons(season_id) ON DELETE CASCADE,
  level INTEGER NOT NULL CHECK (level > 0),
  track VARCHAR(8) NOT NULL CHECK (track IN ('free', 'premium')),
  credits INTEGER NOT NULL CHECK (credits > 0),
  PRIMARY KEY (season_id, level, track)
);

CREATE TABLE battle_card_progress (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season_id VARCHAR(40) NOT NULL REFERENCES battle_card_seasons(season_id) ON DELETE CASCADE,
  experience INTEGER NOT NULL DEFAULT 0 CHECK (experience >= 0),
  bonus_levels INTEGER NOT NULL DEFAULT 0 CHECK (bonus_levels >= 0),
  premium_unlocked BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, season_id)
);

CREATE TABLE battle_card_claims (
  user_id BIGINT NOT NULL,
  season_id VARCHAR(40) NOT NULL,
  level INTEGER NOT NULL,
  track VARCHAR(8) NOT NULL CHECK (track IN ('free', 'premium')),
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, season_id, level, track),
  FOREIGN KEY (user_id, season_id)
    REFERENCES battle_card_progress(user_id, season_id) ON DELETE CASCADE,
  FOREIGN KEY (season_id, level, track)
    REFERENCES battle_card_rewards(season_id, level, track)
);
