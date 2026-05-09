use std::sync::Mutex;

use crate::{
    app::AppSettings,
    errors::{AppError, AppResult},
    providers::{LibraryItem, ProviderKind, ServerProfile},
};

use super::{AppSettingsRepository, Database, MediaCacheRepository, ServerProfileRepository};

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

    pub fn rename_server_profile(
        &self,
        server_id: &str,
        name: &str,
        updated_at: &str,
    ) -> AppResult<ServerProfile> {
        self.with_database(|database| {
            let repository = ServerProfileRepository::new(database.connection());
            repository.rename(server_id, name, updated_at)?;
            repository.get(server_id)?.ok_or_else(|| {
                AppError::new(
                    "persistence.server_not_found",
                    "Saved server profile was not found",
                )
                .with_recoverable(true)
            })
        })
    }

    pub fn create_server_line(
        &self,
        server_id: &str,
        name: &str,
        base_url: &str,
        updated_at: &str,
    ) -> AppResult<ServerProfile> {
        self.with_database(|database| {
            ServerProfileRepository::new(database.connection())
                .create_line(server_id, name, base_url, updated_at)
        })
    }

    pub fn update_server_line(
        &self,
        server_id: &str,
        line_id: &str,
        name: &str,
        base_url: &str,
        updated_at: &str,
    ) -> AppResult<ServerProfile> {
        self.with_database(|database| {
            ServerProfileRepository::new(database.connection())
                .update_line(server_id, line_id, name, base_url, updated_at)
        })
    }

    pub fn select_server_line(
        &self,
        server_id: &str,
        line_id: &str,
        updated_at: &str,
    ) -> AppResult<ServerProfile> {
        self.with_database(|database| {
            ServerProfileRepository::new(database.connection())
                .select_line(server_id, line_id, updated_at)
        })
    }

    pub fn delete_server_line(
        &self,
        server_id: &str,
        line_id: &str,
        updated_at: &str,
    ) -> AppResult<ServerProfile> {
        self.with_database(|database| {
            ServerProfileRepository::new(database.connection())
                .delete_line(server_id, line_id, updated_at)
        })
    }

    pub fn delete_server_profile(&self, server_id: &str) -> AppResult<()> {
        self.with_database(|database| {
            ServerProfileRepository::new(database.connection()).delete(server_id)
        })
    }

    pub fn settings(&self) -> AppResult<AppSettings> {
        self.with_database(|database| AppSettingsRepository::new(database.connection()).get())
    }

    pub fn update_settings(&self, settings: &AppSettings) -> AppResult<()> {
        self.with_database(|database| {
            AppSettingsRepository::new(database.connection()).update(settings)
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
