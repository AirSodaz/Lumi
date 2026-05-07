use rusqlite::{params, Connection, OptionalExtension};

use crate::{
    errors::AppResult,
    providers::{LibraryItem, ProviderKind},
};

use super::provider_kind_slug;

pub struct MediaCacheRepository<'connection> {
    connection: &'connection Connection,
}

impl<'connection> MediaCacheRepository<'connection> {
    pub fn new(connection: &'connection Connection) -> Self {
        Self { connection }
    }

    pub fn upsert(&self, item: &LibraryItem) -> AppResult<()> {
        let item_json = serde_json::to_string(item)?;

        self.connection.execute(
            "
            INSERT INTO media_cache (
              provider_kind, server_id, item_id, item_json, updated_at
            )
            VALUES (?1, ?2, ?3, ?4, CURRENT_TIMESTAMP)
            ON CONFLICT(provider_kind, server_id, item_id) DO UPDATE SET
              item_json = excluded.item_json,
              updated_at = CURRENT_TIMESTAMP
            ",
            params![
                provider_kind_slug(item.provider_kind),
                item.server_id,
                item.id,
                item_json
            ],
        )?;

        Ok(())
    }

    pub fn get(
        &self,
        provider_kind: ProviderKind,
        server_id: &str,
        item_id: &str,
    ) -> AppResult<Option<LibraryItem>> {
        let item_json: Option<String> = self
            .connection
            .query_row(
                "
                SELECT item_json
                FROM media_cache
                WHERE provider_kind = ?1 AND server_id = ?2 AND item_id = ?3
                ",
                params![provider_kind_slug(provider_kind), server_id, item_id],
                |row| row.get(0),
            )
            .optional()?;

        item_json
            .map(|json| serde_json::from_str(&json).map_err(Into::into))
            .transpose()
    }
}
