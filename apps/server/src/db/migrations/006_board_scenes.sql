CREATE TABLE IF NOT EXISTS board_scenes (
  board_id TEXT PRIMARY KEY,
  scene JSONB NOT NULL DEFAULT '{}',
  updated_at BIGINT NOT NULL
);
