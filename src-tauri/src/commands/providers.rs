use tauri::State;

use crate::{app::AppState, errors::AppResult, providers::ServerProfile};

#[tauri::command]
pub fn providers_list_servers(state: State<'_, AppState>) -> AppResult<Vec<ServerProfile>> {
    list_servers_for_state(&state)
}

pub fn list_servers_for_state(state: &AppState) -> AppResult<Vec<ServerProfile>> {
    state.list_servers()
}
