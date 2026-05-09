CREATE TABLE IF NOT EXISTS server_profile_lines (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (server_id) REFERENCES server_profiles(id) ON DELETE CASCADE,
  UNIQUE (server_id, base_url)
);

CREATE INDEX IF NOT EXISTS idx_server_profile_lines_server_id
  ON server_profile_lines(server_id);

INSERT INTO server_profile_lines (
  id, server_id, name, base_url, is_active, created_at, updated_at
)
SELECT
  'line-' || id,
  id,
  'Primary',
  base_url,
  1,
  created_at,
  updated_at
FROM server_profiles
WHERE NOT EXISTS (
  SELECT 1
  FROM server_profile_lines
  WHERE server_profile_lines.server_id = server_profiles.id
);
