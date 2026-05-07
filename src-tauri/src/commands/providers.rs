use tauri::State;

use serde::{Deserialize, Serialize};

use crate::{
    app::AppState,
    errors::AppResult,
    providers::{LibraryItem, MediaProvider, ServerProfile},
};

use super::auth::emby_provider_for_state;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListLibrariesRequest {
    pub server_id: String,
}

#[tauri::command]
pub fn providers_list_servers(state: State<'_, AppState>) -> AppResult<Vec<ServerProfile>> {
    list_servers_for_state(&state)
}

pub fn list_servers_for_state(state: &AppState) -> AppResult<Vec<ServerProfile>> {
    state.list_servers()
}

#[tauri::command]
pub async fn providers_list_libraries(
    state: State<'_, AppState>,
    request: ListLibrariesRequest,
) -> AppResult<Vec<LibraryItem>> {
    let state = super::state_for_blocking(state.inner());
    super::run_blocking_command(move || list_libraries_for_state(&state, request)).await
}

pub fn list_libraries_for_state(
    state: &AppState,
    request: ListLibrariesRequest,
) -> AppResult<Vec<LibraryItem>> {
    emby_provider_for_state(state).list_libraries(&request.server_id)
}
