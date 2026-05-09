use tauri::State;

use serde::{Deserialize, Serialize};

use crate::{
    app::AppState,
    errors::{AppError, AppResult},
    providers::{LibraryItem, MediaProvider, ServerProfile},
};

use super::auth::{emby_provider_for_deps, emby_provider_for_state};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListLibrariesRequest {
    pub server_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateServerProfileRequest {
    pub server_id: String,
    pub name: String,
}

#[tauri::command]
pub fn providers_list_servers(state: State<'_, AppState>) -> AppResult<Vec<ServerProfile>> {
    list_servers_for_state(&state)
}

pub fn list_servers_for_state(state: &AppState) -> AppResult<Vec<ServerProfile>> {
    state.list_servers()
}

#[tauri::command]
pub fn providers_update_server_profile(
    state: State<'_, AppState>,
    request: UpdateServerProfileRequest,
) -> AppResult<ServerProfile> {
    update_server_profile_for_state(&state, request)
}

pub fn update_server_profile_for_state(
    state: &AppState,
    request: UpdateServerProfileRequest,
) -> AppResult<ServerProfile> {
    let name = request.name.trim();
    if name.is_empty() {
        return Err(
            AppError::new("providers.server_name_required", "Server name is required")
                .with_recoverable(true),
        );
    }

    state.local_store().rename_server_profile(
        &request.server_id,
        name,
        &state.clock().now_iso8601(),
    )
}

#[tauri::command]
pub async fn providers_list_libraries(
    state: State<'_, AppState>,
    request: ListLibrariesRequest,
) -> AppResult<Vec<LibraryItem>> {
    let deps = super::BlockingProviderDeps::from_state(state.inner());
    super::run_blocking_command(move || {
        emby_provider_for_deps(&deps).list_libraries(&request.server_id)
    })
    .await
}

pub fn list_libraries_for_state(
    state: &AppState,
    request: ListLibrariesRequest,
) -> AppResult<Vec<LibraryItem>> {
    emby_provider_for_state(state).list_libraries(&request.server_id)
}
