#[tauri::command]
pub fn get_bootstrap_status() -> &'static str {
    "lumi-bootstrap-ready"
}
