use std::sync::{Arc, Mutex};

use lumi_lib::{
    app::{AppSettingsPatch, AppState, PlayerSettings, SubtitlePreference},
    commands::settings as settings_commands,
    errors::AppResult,
    persistence::{CredentialKey, Database, LocalStore, MemoryCredentialStore},
    player::{MpvBackend, MpvOpenRequest, PlaybackCommand},
    providers::{
        emby::{Clock, EmbyHttpRequest, EmbyHttpResponse, EmbyHttpTransport},
        ProviderKind, ServerProfile,
    },
};
use serde_json::Value;

#[test]
fn settings_update_persists_player_preferences() {
    let state = test_state(Arc::new(FakeMpvBackend::default()));

    let updated = settings_commands::update_settings_for_state(
        &state,
        AppSettingsPatch {
            default_volume: Some(72),
            subtitle_preference: Some(SubtitlePreference::Always),
            ..Default::default()
        },
    )
    .expect("update settings");

    assert_eq!(
        updated.player,
        PlayerSettings {
            default_volume: 72,
            subtitle_preference: SubtitlePreference::Always,
        }
    );
    assert_eq!(state.settings().player.default_volume, 72);
}

#[test]
fn settings_update_clamps_default_volume() {
    let state = test_state(Arc::new(FakeMpvBackend::default()));

    let updated = settings_commands::update_settings_for_state(
        &state,
        AppSettingsPatch {
            default_volume: Some(120),
            ..Default::default()
        },
    )
    .expect("update settings");

    assert_eq!(updated.player.default_volume, 100);
}

#[test]
fn settings_reports_material_state_and_player_diagnostics() {
    let state = test_state(Arc::new(FakeMpvBackend::default()));

    let material = settings_commands::get_material_state_for_state(&state).expect("material state");
    let diagnostic = settings_commands::diagnose_mpv_for_state(&state).expect("mpv diagnostic");

    assert_eq!(material.status, "fallback");
    assert!(!material.reason.is_empty());
    assert_eq!(diagnostic.status, "available");
    assert_eq!(diagnostic.message, "Native mpv backend is ready");
}

#[test]
fn settings_exports_redacted_recent_logs() {
    let state = test_state(Arc::new(FakeMpvBackend::default()));
    let profile = seed_profile_with_token(&state);

    let export = settings_commands::export_logs_for_state(&state).expect("export logs");

    assert!(export.file_name.starts_with("lumi-logs-"));
    assert!(export.contents.contains("Lumi diagnostics export"));
    assert!(export.contents.contains("server: server-1"));
    assert!(export.contents.contains(&profile.name));
    assert!(!export.contents.contains("token-value"));
}

fn test_state(backend: Arc<dyn MpvBackend>) -> AppState {
    let database = Database::open_in_memory().expect("open database");
    database.initialize().expect("initialize database");
    AppState::with_services_and_player(
        Arc::new(LocalStore::new(database)),
        Arc::new(MemoryCredentialStore::default()),
        Arc::new(FakeEmbyTransport),
        Arc::new(FixedClock),
        backend,
    )
}

fn seed_profile_with_token(state: &AppState) -> ServerProfile {
    let profile = ServerProfile {
        id: "server-1".into(),
        provider_kind: ProviderKind::Emby,
        name: "Demo Server".into(),
        base_url: "http://localhost:8096".into(),
        user_id: "user-1".into(),
        created_at: "2026-05-07T00:00:00Z".into(),
        updated_at: "2026-05-07T00:00:00Z".into(),
    };

    state
        .local_store()
        .upsert_server_profile(&profile)
        .expect("persist profile");
    state
        .credential_store()
        .set_token(&CredentialKey::server_token(&profile), "token-value")
        .expect("persist token");

    profile
}

struct FixedClock;

impl Clock for FixedClock {
    fn now_iso8601(&self) -> String {
        "2026-05-08T00:00:00Z".into()
    }
}

struct FakeEmbyTransport;

impl EmbyHttpTransport for FakeEmbyTransport {
    fn send(&self, _request: EmbyHttpRequest) -> AppResult<EmbyHttpResponse> {
        Ok(EmbyHttpResponse {
            status: 204,
            body: Value::Null,
            headers: Vec::new(),
        })
    }
}

#[derive(Default)]
struct FakeMpvBackend {
    commands: Mutex<Vec<(String, PlaybackCommand)>>,
}

impl MpvBackend for FakeMpvBackend {
    fn open(&self, _request: MpvOpenRequest) -> AppResult<()> {
        Ok(())
    }

    fn command(&self, session_id: &str, command: PlaybackCommand) -> AppResult<()> {
        self.commands
            .lock()
            .unwrap()
            .push((session_id.into(), command));
        Ok(())
    }

    fn close(&self, session_id: &str) -> AppResult<()> {
        self.command(session_id, PlaybackCommand::Close)
    }

    fn position_seconds(&self, _session_id: &str) -> AppResult<Option<u32>> {
        Ok(Some(0))
    }
}
