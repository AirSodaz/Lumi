use rusqlite::{params, Connection, OptionalExtension};

use crate::{errors::AppResult, providers::ServerProfile};

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
            let row = row?;
            profiles.push(ServerProfile {
                id: row.id,
                provider_kind: parse_provider_kind(&row.provider_kind)?,
                name: row.name,
                base_url: row.base_url,
                user_id: row.user_id,
                created_at: row.created_at,
                updated_at: row.updated_at,
            });
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

        row.map(|row| {
            Ok(ServerProfile {
                id: row.id,
                provider_kind: parse_provider_kind(&row.provider_kind)?,
                name: row.name,
                base_url: row.base_url,
                user_id: row.user_id,
                created_at: row.created_at,
                updated_at: row.updated_at,
            })
        })
        .transpose()
    }

    pub fn delete(&self, server_id: &str) -> AppResult<()> {
        self.connection.execute(
            "DELETE FROM server_profiles WHERE id = ?1",
            params![server_id],
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
