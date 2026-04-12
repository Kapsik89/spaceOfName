CREATE TABLE IF NOT EXISTS battles (
  key TEXT PRIMARY KEY,
  title TEXT,
  config_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_battles_updated_at
ON battles(updated_at DESC);
