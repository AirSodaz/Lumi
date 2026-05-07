pub mod auth;
pub mod bootstrap;
pub mod media;
pub mod playback;
pub mod providers;
pub mod settings;

pub use bootstrap::get_bootstrap_status;

use serde_json::json;

use crate::{
    app::AppState,
    errors::{AppError, AppResult},
};

pub(crate) fn state_for_blocking(state: &AppState) -> AppState {
    AppState::with_services(
        state.local_store(),
        state.credential_store(),
        state.emby_transport(),
        state.clock(),
    )
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
