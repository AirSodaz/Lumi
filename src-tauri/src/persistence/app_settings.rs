use rusqlite::{params, Connection};

use crate::{
    app::{AppSettings, PlayerSettings, SubtitlePreference, ThemePreference},
    errors::{AppError, AppResult},
};

pub struct AppSettingsRepository<'a> {
    connection: &'a Connection,
}

impl<'a> AppSettingsRepository<'a> {
    pub fn new(connection: &'a Connection) -> Self {
        Self { connection }
    }

    pub fn get(&self) -> AppResult<AppSettings> {
        match self.connection.query_row(
            "
            SELECT theme, material_effects_enabled, default_volume, subtitle_preference
            FROM app_settings
            WHERE id = 1
            ",
            [],
            |row| {
                let theme: String = row.get(0)?;
                let material_effects_enabled: bool = row.get(1)?;
                let default_volume: u8 = row.get(2)?;
                let subtitle_preference: String = row.get(3)?;

                Ok((
                    theme,
                    material_effects_enabled,
                    default_volume,
                    subtitle_preference,
                ))
            },
        ) {
            Ok((theme, material_effects_enabled, default_volume, subtitle_preference)) => {
                Ok(AppSettings {
                    theme: parse_theme_preference(&theme)?,
                    material_effects_enabled,
                    player: PlayerSettings {
                        default_volume,
                        subtitle_preference: parse_subtitle_preference(&subtitle_preference)?,
                    },
                })
            }
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(AppSettings::default()),
            Err(error) => Err(error.into()),
        }
    }

    pub fn update(&self, settings: &AppSettings) -> AppResult<()> {
        self.connection.execute(
            "
            INSERT INTO app_settings (
              id, theme, material_effects_enabled, default_volume, subtitle_preference, updated_at
            )
            VALUES (1, ?1, ?2, ?3, ?4, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
              theme = excluded.theme,
              material_effects_enabled = excluded.material_effects_enabled,
              default_volume = excluded.default_volume,
              subtitle_preference = excluded.subtitle_preference,
              updated_at = CURRENT_TIMESTAMP
            ",
            params![
                theme_preference_slug(&settings.theme),
                settings.material_effects_enabled,
                settings.player.default_volume,
                subtitle_preference_slug(&settings.player.subtitle_preference),
            ],
        )?;

        Ok(())
    }
}

fn parse_theme_preference(value: &str) -> AppResult<ThemePreference> {
    match value {
        "system" => Ok(ThemePreference::System),
        "light" => Ok(ThemePreference::Light),
        "dark" => Ok(ThemePreference::Dark),
        other => Err(AppError::new(
            "persistence.theme_preference",
            "Stored theme preference is unsupported",
        )
        .with_detail(serde_json::json!({ "theme": other }))),
    }
}

fn theme_preference_slug(value: &ThemePreference) -> &'static str {
    match value {
        ThemePreference::System => "system",
        ThemePreference::Light => "light",
        ThemePreference::Dark => "dark",
    }
}

fn parse_subtitle_preference(value: &str) -> AppResult<SubtitlePreference> {
    match value {
        "serverDefault" => Ok(SubtitlePreference::ServerDefault),
        "always" => Ok(SubtitlePreference::Always),
        "off" => Ok(SubtitlePreference::Off),
        other => Err(AppError::new(
            "persistence.subtitle_preference",
            "Stored subtitle preference is unsupported",
        )
        .with_detail(serde_json::json!({ "subtitlePreference": other }))),
    }
}

fn subtitle_preference_slug(value: &SubtitlePreference) -> &'static str {
    match value {
        SubtitlePreference::ServerDefault => "serverDefault",
        SubtitlePreference::Always => "always",
        SubtitlePreference::Off => "off",
    }
}
