pub mod app;
pub mod commands;
pub mod errors;
pub mod events;
pub mod player;
pub mod providers;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(app::AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::bootstrap::get_bootstrap_status,
            commands::providers::providers_list_servers,
            commands::settings::settings_get,
            commands::settings::settings_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
