CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('system', 'light', 'dark')),
  material_effects_enabled INTEGER NOT NULL DEFAULT 1 CHECK (material_effects_enabled IN (0, 1)),
  default_volume INTEGER NOT NULL DEFAULT 100 CHECK (default_volume BETWEEN 0 AND 100),
  subtitle_preference TEXT NOT NULL DEFAULT 'serverDefault' CHECK (subtitle_preference IN ('serverDefault', 'always', 'off')),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO app_settings (
  id, theme, material_effects_enabled, default_volume, subtitle_preference
)
VALUES (1, 'system', 1, 100, 'serverDefault')
ON CONFLICT(id) DO NOTHING;
