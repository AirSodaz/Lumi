use tauri::State;

use crate::{
    app::{AppSettings, AppSettingsPatch, AppState},
    errors::AppResult,
};

#[tauri::command]
pub fn settings_get(state: State<'_, AppState>) -> AppResult<AppSettings> {
    get_settings_for_state(&state)
}

#[tauri::command]
pub fn settings_update(
    state: State<'_, AppState>,
    patch: AppSettingsPatch,
) -> AppResult<AppSettings> {
    update_settings_for_state(&state, patch)
}

pub fn get_settings_for_state(state: &AppState) -> AppResult<AppSettings> {
    Ok(state.settings())
}

pub fn update_settings_for_state(
    state: &AppState,
    patch: AppSettingsPatch,
) -> AppResult<AppSettings> {
    state.update_settings(patch)
}
