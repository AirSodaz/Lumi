pub mod app;
pub mod commands;
pub mod errors;
pub mod events;
pub mod persistence;
pub mod player;
pub mod providers;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            let resource_dir = app.path().resource_dir().ok();
            std::fs::create_dir_all(&app_data_dir)?;
            app.manage(app::AppState::persistent_with_resource_dir(
                app_data_dir.join("lumi.sqlite3"),
                resource_dir,
            )?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::bootstrap::get_bootstrap_status,
            commands::auth::auth_login_manual,
            commands::providers::providers_list_servers,
            commands::providers::providers_list_libraries,
            commands::media::media_list_children,
            commands::media::media_get_item,
            commands::media::media_get_home_rows,
            commands::playback::playback_open,
            commands::playback::playback_command,
            commands::settings::settings_get,
            commands::settings::settings_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
