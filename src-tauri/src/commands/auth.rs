use tauri::State;

use crate::{
    app::AppState,
    errors::AppResult,
    providers::{emby::EmbyProvider, LoginRequest, MediaProvider, ServerProfile},
};

#[tauri::command]
pub async fn auth_login_manual(
    state: State<'_, AppState>,
    request: LoginRequest,
) -> AppResult<ServerProfile> {
    let state = super::state_for_blocking(state.inner());
    super::run_blocking_command(move || login_manual_for_state(&state, request)).await
}

pub fn login_manual_for_state(state: &AppState, request: LoginRequest) -> AppResult<ServerProfile> {
    emby_provider_for_state(state).login_manual(request)
}

pub(crate) fn emby_provider_for_state(state: &AppState) -> EmbyProvider {
    EmbyProvider::new_with_clock(
        state.local_store(),
        state.credential_store(),
        state.emby_transport(),
        state.clock(),
    )
}
