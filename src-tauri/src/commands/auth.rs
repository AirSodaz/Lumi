use tauri::State;

use serde::{Deserialize, Serialize};

use crate::{
    app::AppState,
    errors::AppResult,
    persistence::CredentialKey,
    providers::{emby::EmbyProvider, LoginRequest, MediaProvider, ServerProfile},
};

use super::BlockingProviderDeps;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogoutRequest {
    pub server_id: String,
}

#[tauri::command]
pub async fn auth_login_manual(
    state: State<'_, AppState>,
    request: LoginRequest,
) -> AppResult<ServerProfile> {
    let deps = BlockingProviderDeps::from_state(state.inner());
    super::run_blocking_command(move || {
        emby_provider_for_deps(&deps).login_manual(request)
    })
    .await
}

pub fn login_manual_for_state(state: &AppState, request: LoginRequest) -> AppResult<ServerProfile> {
    emby_provider_for_state(state).login_manual(request)
}

#[tauri::command]
pub async fn auth_logout(state: State<'_, AppState>, request: LogoutRequest) -> AppResult<()> {
    let local_store = state.local_store();
    let credential_store = state.credential_store();
    super::run_blocking_command(move || {
        let profile = local_store.get_server_profile(&request.server_id)?;
        credential_store.delete_token(&CredentialKey::server_token(&profile))?;
        local_store.delete_server_profile(&request.server_id)
    })
    .await
}

pub fn logout_for_state(state: &AppState, request: LogoutRequest) -> AppResult<()> {
    let profile = state.local_store().get_server_profile(&request.server_id)?;
    state
        .credential_store()
        .delete_token(&CredentialKey::server_token(&profile))?;
    state
        .local_store()
        .delete_server_profile(&request.server_id)
}

pub(crate) fn emby_provider_for_state(state: &AppState) -> EmbyProvider {
    EmbyProvider::new_with_clock(
        state.local_store(),
        state.credential_store(),
        state.emby_transport(),
        state.clock(),
    )
}

pub(crate) fn emby_provider_for_deps(deps: &BlockingProviderDeps) -> EmbyProvider {
    EmbyProvider::new_with_clock(
        deps.local_store.clone(),
        deps.credential_store.clone(),
        deps.emby_transport.clone(),
        deps.clock.clone(),
    )
}
