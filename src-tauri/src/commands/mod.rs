pub mod auth;
pub mod bootstrap;
pub mod media;
pub mod playback;
pub mod providers;
pub mod settings;

pub use bootstrap::get_bootstrap_status;

use std::sync::Arc;

use serde_json::json;

use crate::{
    app::AppState,
    errors::{AppError, AppResult},
    persistence::{CredentialStore, LocalStore},
    providers::emby::{Clock, EmbyHttpTransport},
};

pub(crate) struct BlockingProviderDeps {
    pub(crate) local_store: Arc<LocalStore>,
    pub(crate) credential_store: Arc<dyn CredentialStore>,
    pub(crate) emby_transport: Arc<dyn EmbyHttpTransport>,
    pub(crate) clock: Arc<dyn Clock>,
}

impl BlockingProviderDeps {
    pub(crate) fn from_state(state: &AppState) -> Self {
        Self {
            local_store: state.local_store(),
            credential_store: state.credential_store(),
            emby_transport: state.emby_transport(),
            clock: state.clock(),
        }
    }
}

pub(crate) async fn run_blocking_command<T, F>(operation: F) -> AppResult<T>
where
    T: Send + 'static,
    F: FnOnce() -> AppResult<T> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(operation)
        .await
        .map_err(|error| {
            AppError::new(
                "runtime.blocking_task_failed",
                "Background command task failed",
            )
            .with_recoverable(true)
            .with_detail(json!({ "source": error.to_string() }))
        })?
}
