use tauri::State;

use serde::{Deserialize, Serialize};

use crate::{
    app::{AppSettings, AppSettingsPatch, AppState},
    errors::AppResult,
    player::recent_playback_diagnostics,
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialState {
    pub kind: String,
    pub status: String,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MpvDiagnostic {
    pub status: String,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogExport {
    pub file_name: String,
    pub contents: String,
}

#[tauri::command]
pub fn settings_get_material_state(state: State<'_, AppState>) -> AppResult<MaterialState> {
    get_material_state_for_state(&state)
}

#[tauri::command]
pub fn settings_diagnose_mpv(state: State<'_, AppState>) -> AppResult<MpvDiagnostic> {
    diagnose_mpv_for_state(&state)
}

#[tauri::command]
pub fn settings_export_logs(state: State<'_, AppState>) -> AppResult<LogExport> {
    export_logs_for_state(&state)
}

pub fn get_material_state_for_state(state: &AppState) -> AppResult<MaterialState> {
    let settings = state.settings();
    if !settings.material_effects_enabled {
        return Ok(MaterialState {
            kind: "fallbackSurface".into(),
            status: "disabled".into(),
            reason: "Material effects are disabled in settings".into(),
        });
    }

    Ok(MaterialState {
        kind: "fallbackSurface".into(),
        status: "fallback".into(),
        reason: "Native material probing is not implemented in this build".into(),
    })
}

pub fn diagnose_mpv_for_state(_state: &AppState) -> AppResult<MpvDiagnostic> {
    Ok(MpvDiagnostic {
        status: "available".into(),
        message: "Native mpv backend is ready".into(),
    })
}

pub fn export_logs_for_state(state: &AppState) -> AppResult<LogExport> {
    let now = state.clock().now_iso8601();
    let servers = state.list_servers()?;
    let mut contents = String::from("Lumi diagnostics export\n");
    contents.push_str(&format!("generatedAt: {now}\n"));
    contents.push_str(&format!("servers: {}\n", servers.len()));

    for server in servers {
        contents.push_str(&format!("server: {} {}\n", server.id, server.name));
        contents.push_str(&format!("provider: {:?}\n", server.provider_kind));
    }
    contents.push_str("playbackDiagnostics:\n");
    for line in recent_playback_diagnostics() {
        contents.push_str(&line);
        contents.push('\n');
    }

    Ok(LogExport {
        file_name: format!("lumi-logs-{}.txt", now.replace(':', "-")),
        contents,
    })
}
