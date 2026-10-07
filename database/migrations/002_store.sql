CREATE TABLE user_wallets (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  credits INTEGER NOT NULL DEFAULT 1000 CHECK (credits >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO user_wallets (user_id, credits)
SELECT id, 1000 FROM users
ON CONFLICT (user_id) DO NOTHING;

CREATE TABLE store_items (
  item_id VARCHAR(40) PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(200) NOT NULL,
  category VARCHAR(24) NOT NULL CHECK (category = 'theme'),
  theme_key VARCHAR(32) NOT NULL UNIQUE CHECK (theme_key IN ('lava-red', 'matrix-green', 'royal-purple')),
  price INTEGER NOT NULL CHECK (price > 0),
  enabled BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO store_items (item_id, name, description, category, theme_key, price) VALUES
  ('theme-lava', 'Lava Rossa', 'Un tema ardente per l’arena.', 'theme', 'lava-red', 350),
  ('theme-matrix', 'Matrix', 'Accenti verdi per una partita nel codice.', 'theme', 'matrix-green', 350),
  ('theme-royal', 'Viola Reale', 'Un look regale con bagliori viola.', 'theme', 'royal-purple', 500);

CREATE TABLE user_inventory (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id VARCHAR(40) NOT NULL REFERENCES store_items(item_id),
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  equipped BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE credit_transactions (
  transaction_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount <> 0),
  reason VARCHAR(16) NOT NULL CHECK (reason IN ('starter', 'purchase', 'reward', 'refund')),
  item_id VARCHAR(40) REFERENCES store_items(item_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO credit_transactions (user_id, amount, reason)
SELECT wallet.user_id, wallet.credits, 'starter'
FROM user_wallets wallet
WHERE NOT EXISTS (
  SELECT 1 FROM credit_transactions history
  WHERE history.user_id = wallet.user_id
);

CREATE UNIQUE INDEX user_inventory_one_equipped_theme
  ON user_inventory (user_id)
  WHERE equipped;

CREATE FUNCTION create_user_wallet() RETURNS TRIGGER AS $$
DECLARE
  wallet_user_id BIGINT;
BEGIN
  INSERT INTO user_wallets (user_id, credits) VALUES (NEW.id, 1000)
  ON CONFLICT (user_id) DO NOTHING
  RETURNING user_id INTO wallet_user_id;
  IF wallet_user_id IS NOT NULL THEN
    INSERT INTO credit_transactions (user_id, amount, reason)
    VALUES (wallet_user_id, 1000, 'starter');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_create_wallet
  AFTER INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION create_user_wallet();
