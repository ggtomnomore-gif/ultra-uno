CREATE TABLE daily_challenges (
  challenge_id VARCHAR(40) PRIMARY KEY,
  title VARCHAR(80) NOT NULL,
  description VARCHAR(200) NOT NULL,
  metric VARCHAR(16) NOT NULL CHECK (metric IN ('uno_match', 'uno_win')),
  target INTEGER NOT NULL CHECK (target > 0),
  reward INTEGER NOT NULL CHECK (reward > 0),
  enabled BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE user_daily_challenges (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_id VARCHAR(40) NOT NULL REFERENCES daily_challenges(challenge_id),
  challenge_date DATE NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0),
  claimed BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, challenge_id, challenge_date)
);

INSERT INTO daily_challenges
  (challenge_id, title, description, metric, target, reward)
VALUES
  ('uno-first-match', 'Prima partita', 'Completa una partita UNO online.', 'uno_match', 1, 50),
  ('uno-three-matches', 'Sempre in gioco', 'Completa tre partite UNO online.', 'uno_match', 3, 150),
  ('uno-first-win', 'Vittoria del giorno', 'Vinci una partita UNO online.', 'uno_win', 1, 100);
