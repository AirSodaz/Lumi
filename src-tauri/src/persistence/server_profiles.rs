use reqwest::Url;
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::json;
use uuid::Uuid;

use crate::{
    errors::{AppError, AppResult},
    providers::{ServerLine, ServerProfile},
};

use super::{parse_provider_kind, provider_kind_slug};

pub struct ServerProfileRepository<'connection> {
    connection: &'connection Connection,
}

impl<'connection> ServerProfileRepository<'connection> {
    pub fn new(connection: &'connection Connection) -> Self {
        Self { connection }
    }

    pub fn upsert(&self, profile: &ServerProfile) -> AppResult<()> {
        self.connection.execute(
            "
            INSERT INTO server_profiles (
              id, provider_kind, name, base_url, user_id, created_at, updated_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            ON CONFLICT(id) DO UPDATE SET
              provider_kind = excluded.provider_kind,
              name = excluded.name,
              base_url = excluded.base_url,
              user_id = excluded.user_id,
              created_at = excluded.created_at,
              updated_at = excluded.updated_at
            ",
            params![
                profile.id,
                provider_kind_slug(profile.provider_kind),
                profile.name,
                profile.base_url,
                profile.user_id,
                profile.created_at,
                profile.updated_at
            ],
        )?;

        let lines = if profile.lines.is_empty() {
            vec![default_line(profile)]
        } else {
            normalize_profile_lines(profile)
        };
        self.replace_lines(&profile.id, &lines)?;

        Ok(())
    }

    pub fn list(&self) -> AppResult<Vec<ServerProfile>> {
        let mut statement = self.connection.prepare(
            "
            SELECT id, provider_kind, name, base_url, user_id, created_at, updated_at
            FROM server_profiles
            ORDER BY updated_at DESC, name COLLATE NOCASE ASC
            ",
        )?;

        let rows = statement.query_map([], |row| {
            Ok(ServerProfileRow {
                id: row.get(0)?,
                provider_kind: row.get(1)?,
                name: row.get(2)?,
                base_url: row.get(3)?,
                user_id: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })?;

        let mut profiles = Vec::new();
        for row in rows {
            profiles.push(self.profile_from_row(row?)?);
        }

        Ok(profiles)
    }

    pub fn get(&self, server_id: &str) -> AppResult<Option<ServerProfile>> {
        let row = self
            .connection
            .query_row(
                "
                SELECT id, provider_kind, name, base_url, user_id, created_at, updated_at
                FROM server_profiles
                WHERE id = ?1
                ",
                params![server_id],
                |row| {
                    Ok(ServerProfileRow {
                        id: row.get(0)?,
                        provider_kind: row.get(1)?,
                        name: row.get(2)?,
                        base_url: row.get(3)?,
                        user_id: row.get(4)?,
                        created_at: row.get(5)?,
                        updated_at: row.get(6)?,
                    })
                },
            )
            .optional()?;

        row.map(|row| self.profile_from_row(row)).transpose()
    }

    pub fn rename(&self, server_id: &str, name: &str, updated_at: &str) -> AppResult<()> {
        self.connection.execute(
            "
            UPDATE server_profiles
            SET name = ?2, updated_at = ?3
            WHERE id = ?1
            ",
            params![server_id, name, updated_at],
        )?;

        Ok(())
    }

    pub fn create_line(
        &self,
        server_id: &str,
        name: &str,
        base_url: &str,
        updated_at: &str,
    ) -> AppResult<ServerProfile> {
        let profile = self.required_profile(server_id)?;
        let line = ServerLine {
            id: new_line_id(),
            server_id: server_id.into(),
            name: normalize_line_name(name),
            base_url: normalize_base_url(base_url)?,
            is_active: false,
            created_at: updated_at.into(),
            updated_at: updated_at.into(),
        };

        ensure_unique_line_url(&profile.lines, None, &line.base_url)?;
        self.connection.execute(
            "
            INSERT INTO server_profile_lines (
              id, server_id, name, base_url, is_active, created_at, updated_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            ",
            params![
                line.id,
                line.server_id,
                line.name,
                line.base_url,
                bool_to_i64(line.is_active),
                line.created_at,
                line.updated_at
            ],
        )?;
        self.touch_profile(server_id, updated_at)?;

        self.required_profile(server_id)
    }

    pub fn update_line(
        &self,
        server_id: &str,
        line_id: &str,
        name: &str,
        base_url: &str,
        updated_at: &str,
    ) -> AppResult<ServerProfile> {
        let profile = self.required_profile(server_id)?;
        let existing = profile
            .lines
            .iter()
            .find(|line| line.id == line_id)
            .ok_or_else(line_not_found)?;
        let normalized_url = normalize_base_url(base_url)?;
        ensure_unique_line_url(&profile.lines, Some(line_id), &normalized_url)?;

        self.connection.execute(
            "
            UPDATE server_profile_lines
            SET name = ?3, base_url = ?4, updated_at = ?5
            WHERE server_id = ?1 AND id = ?2
            ",
            params![
                server_id,
                line_id,
                normalize_line_name(name),
                normalized_url,
                updated_at
            ],
        )?;

        if existing.is_active {
            self.connection.execute(
                "
                UPDATE server_profiles
                SET base_url = ?2, updated_at = ?3
                WHERE id = ?1
                ",
                params![server_id, normalized_url, updated_at],
            )?;
        } else {
            self.touch_profile(server_id, updated_at)?;
        }

        self.required_profile(server_id)
    }

    pub fn select_line(
        &self,
        server_id: &str,
        line_id: &str,
        updated_at: &str,
    ) -> AppResult<ServerProfile> {
        let profile = self.required_profile(server_id)?;
        let selected_url = profile
            .lines
            .iter()
            .find(|line| line.id == line_id)
            .map(|line| line.base_url.clone())
            .ok_or_else(line_not_found)?;

        self.connection.execute(
            "
            UPDATE server_profile_lines
            SET is_active = CASE WHEN id = ?2 THEN 1 ELSE 0 END,
                updated_at = CASE WHEN id = ?2 THEN ?3 ELSE updated_at END
            WHERE server_id = ?1
            ",
            params![server_id, line_id, updated_at],
        )?;
        self.connection.execute(
            "
            UPDATE server_profiles
            SET base_url = ?2, updated_at = ?3
            WHERE id = ?1
            ",
            params![server_id, selected_url, updated_at],
        )?;

        self.required_profile(server_id)
    }

    pub fn delete_line(
        &self,
        server_id: &str,
        line_id: &str,
        updated_at: &str,
    ) -> AppResult<ServerProfile> {
        let profile = self.required_profile(server_id)?;
        if profile.lines.len() <= 1 {
            return Err(AppError::new(
                "providers.server_line_last",
                "At least one server line is required",
            )
            .with_recoverable(true));
        }

        let deleting_active = profile
            .lines
            .iter()
            .find(|line| line.id == line_id)
            .map(|line| line.is_active)
            .ok_or_else(line_not_found)?;

        self.connection.execute(
            "DELETE FROM server_profile_lines WHERE server_id = ?1 AND id = ?2",
            params![server_id, line_id],
        )?;

        if deleting_active {
            let fallback = self
                .list_lines(server_id)?
                .into_iter()
                .max_by(|left, right| {
                    left.updated_at
                        .cmp(&right.updated_at)
                        .then_with(|| left.name.cmp(&right.name))
                })
                .ok_or_else(line_not_found)?;
            self.select_line(server_id, &fallback.id, updated_at)
        } else {
            self.touch_profile(server_id, updated_at)?;
            self.required_profile(server_id)
        }
    }

    pub fn delete(&self, server_id: &str) -> AppResult<()> {
        self.connection.execute(
            "DELETE FROM server_profiles WHERE id = ?1",
            params![server_id],
        )?;

        Ok(())
    }

    fn replace_lines(&self, server_id: &str, lines: &[ServerLine]) -> AppResult<()> {
        self.connection.execute(
            "DELETE FROM server_profile_lines WHERE server_id = ?1",
            params![server_id],
        )?;
        for line in lines {
            self.connection.execute(
                "
                INSERT INTO server_profile_lines (
                  id, server_id, name, base_url, is_active, created_at, updated_at
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                ",
                params![
                    line.id,
                    server_id,
                    line.name,
                    line.base_url,
                    bool_to_i64(line.is_active),
                    line.created_at,
                    line.updated_at
                ],
            )?;
        }

        Ok(())
    }

    fn profile_from_row(&self, row: ServerProfileRow) -> AppResult<ServerProfile> {
        Ok(ServerProfile {
            id: row.id.clone(),
            provider_kind: parse_provider_kind(&row.provider_kind)?,
            name: row.name,
            base_url: row.base_url,
            lines: self.list_lines(&row.id)?,
            user_id: row.user_id,
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
    }

    fn list_lines(&self, server_id: &str) -> AppResult<Vec<ServerLine>> {
        let mut statement = self.connection.prepare(
            "
            SELECT id, server_id, name, base_url, is_active, created_at, updated_at
            FROM server_profile_lines
            WHERE server_id = ?1
            ORDER BY is_active DESC, updated_at DESC, name COLLATE NOCASE ASC
            ",
        )?;
        let rows = statement.query_map(params![server_id], |row| {
            Ok(ServerLine {
                id: row.get(0)?,
                server_id: row.get(1)?,
                name: row.get(2)?,
                base_url: row.get(3)?,
                is_active: row.get::<_, i64>(4)? != 0,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })?;

        let mut lines = Vec::new();
        for row in rows {
            lines.push(row?);
        }
        Ok(lines)
    }

    fn required_profile(&self, server_id: &str) -> AppResult<ServerProfile> {
        self.get(server_id)?.ok_or_else(|| {
            AppError::new(
                "persistence.server_not_found",
                "Saved server profile was not found",
            )
            .with_recoverable(true)
        })
    }

    fn touch_profile(&self, server_id: &str, updated_at: &str) -> AppResult<()> {
        self.connection.execute(
            "UPDATE server_profiles SET updated_at = ?2 WHERE id = ?1",
            params![server_id, updated_at],
        )?;
        Ok(())
    }
}

struct ServerProfileRow {
    id: String,
    provider_kind: String,
    name: String,
    base_url: String,
    user_id: String,
    created_at: String,
    updated_at: String,
}

fn normalize_profile_lines(profile: &ServerProfile) -> Vec<ServerLine> {
    let has_active = profile.lines.iter().any(|line| line.is_active);
    let mut active_seen = false;
    profile
        .lines
        .iter()
        .enumerate()
        .map(|(index, line)| ServerLine {
            id: line.id.clone(),
            server_id: profile.id.clone(),
            name: normalize_line_name(&line.name),
            base_url: line.base_url.clone(),
            is_active: if line.is_active && !active_seen {
                active_seen = true;
                true
            } else if !has_active && !active_seen && index == 0 {
                active_seen = true;
                true
            } else {
                false
            },
            created_at: line.created_at.clone(),
            updated_at: line.updated_at.clone(),
        })
        .collect()
}

fn default_line(profile: &ServerProfile) -> ServerLine {
    ServerLine {
        id: format!("line-{}", profile.id),
        server_id: profile.id.clone(),
        name: "Primary".into(),
        base_url: profile.base_url.clone(),
        is_active: true,
        created_at: profile.created_at.clone(),
        updated_at: profile.updated_at.clone(),
    }
}

fn ensure_unique_line_url(
    lines: &[ServerLine],
    current_line_id: Option<&str>,
    base_url: &str,
) -> AppResult<()> {
    if lines
        .iter()
        .any(|line| Some(line.id.as_str()) != current_line_id && line.base_url == base_url)
    {
        return Err(AppError::new(
            "providers.server_line_url_duplicate",
            "Server line URL already exists",
        )
        .with_recoverable(true)
        .with_detail(json!({ "baseUrl": base_url })));
    }

    Ok(())
}

fn normalize_line_name(name: &str) -> String {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        "Line".into()
    } else {
        trimmed.into()
    }
}

fn normalize_base_url(base_url: &str) -> AppResult<String> {
    let mut parsed = Url::parse(base_url).map_err(|error| {
        AppError::new("emby.base_url.invalid", "Emby server URL is invalid")
            .with_recoverable(true)
            .with_detail(json!({ "source": error.to_string() }))
    })?;

    match parsed.scheme() {
        "http" | "https" => {}
        scheme => {
            return Err(AppError::new(
                "emby.base_url.unsupported_scheme",
                "Emby server URL must use HTTP or HTTPS",
            )
            .with_recoverable(true)
            .with_detail(json!({ "scheme": scheme })));
        }
    }

    parsed.set_query(None);
    parsed.set_fragment(None);
    if parsed.path() != "/" && !parsed.path().ends_with('/') {
        let path = format!("{}/", parsed.path());
        parsed.set_path(&path);
    }

    Ok(parsed.as_str().trim_end_matches('/').to_string())
}

fn line_not_found() -> AppError {
    AppError::new("providers.server_line_not_found", "Server line was not found")
        .with_recoverable(true)
}

fn new_line_id() -> String {
    format!("line-{}", Uuid::new_v4())
}

fn bool_to_i64(value: bool) -> i64 {
    if value {
        1
    } else {
        0
    }
}
