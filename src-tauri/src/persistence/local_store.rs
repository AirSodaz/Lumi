use std::sync::Mutex;

use crate::{
    errors::{AppError, AppResult},
    providers::{LibraryItem, ProviderKind, ServerProfile},
};

use super::{Database, MediaCacheRepository, ServerProfileRepository};

pub struct LocalStore {
    database: Mutex<Database>,
}

impl LocalStore {
    pub fn new(database: Database) -> Self {
        Self {
            database: Mutex::new(database),
        }
    }

    pub fn upsert_server_profile(&self, profile: &ServerProfile) -> AppResult<()> {
        self.with_database(|database| {
            ServerProfileRepository::new(database.connection()).upsert(profile)
        })
    }

    pub fn list_server_profiles(&self) -> AppResult<Vec<ServerProfile>> {
        self.with_database(|database| ServerProfileRepository::new(database.connection()).list())
    }

    pub fn get_server_profile(&self, server_id: &str) -> AppResult<ServerProfile> {
        self.with_database(|database| {
            ServerProfileRepository::new(database.connection())
                .get(server_id)?
                .ok_or_else(|| {
                    AppError::new(
                        "persistence.server_not_found",
                        "Server profile was not found",
                    )
                    .with_recoverable(true)
                })
        })
    }

    pub fn delete_server_profile(&self, server_id: &str) -> AppResult<()> {
        self.with_database(|database| {
            ServerProfileRepository::new(database.connection()).delete(server_id)
        })
    }

    pub fn cache_media_item(&self, item: &LibraryItem) -> AppResult<()> {
        self.with_database(|database| MediaCacheRepository::new(database.connection()).upsert(item))
    }

    pub fn get_cached_media_item(
        &self,
        provider_kind: ProviderKind,
        server_id: &str,
        item_id: &str,
    ) -> AppResult<Option<LibraryItem>> {
        self.with_database(|database| {
            MediaCacheRepository::new(database.connection()).get(provider_kind, server_id, item_id)
        })
    }

    fn with_database<T>(&self, action: impl FnOnce(&Database) -> AppResult<T>) -> AppResult<T> {
        let database = self
            .database
            .lock()
            .map_err(|_| AppError::state_lock_poisoned("local_store"))?;
        action(&database)
    }
}
