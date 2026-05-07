mod credentials;
mod database;
mod media_cache;
mod migrations;
mod server_profiles;

use serde_json::json;

pub use credentials::{
    CredentialKey, CredentialStore, MemoryCredentialStore, SystemCredentialStore,
};
pub use database::Database;
pub use media_cache::MediaCacheRepository;
pub use server_profiles::ServerProfileRepository;

use crate::{
    errors::{AppError, AppResult},
    providers::ProviderKind,
};

pub(super) fn provider_kind_slug(kind: ProviderKind) -> &'static str {
    match kind {
        ProviderKind::Emby => "emby",
    }
}

pub(super) fn parse_provider_kind(value: &str) -> AppResult<ProviderKind> {
    match value {
        "emby" => Ok(ProviderKind::Emby),
        other => Err(AppError::new(
            "persistence.provider_kind",
            "Stored provider kind is unsupported",
        )
        .with_detail(json!({ "providerKind": other }))),
    }
}
