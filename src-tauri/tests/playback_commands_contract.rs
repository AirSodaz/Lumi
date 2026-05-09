use std::{
    sync::{Arc, Condvar, Mutex},
    time::{Duration, Instant},
};

use lumi_lib::{
    app::AppState,
    commands::playback,
    errors::AppResult,
    persistence::{CredentialKey, Database, LocalStore, MemoryCredentialStore},
    player::{
        MpvBackend, MpvEventSink, MpvOpenRequest, PlaybackCommand, PlaybackErrorEvent,
        PlaybackHost, PlaybackPositionEvent, PlayerOpenRequest, PlayerSession,
        ResolvedPlaybackSource,
    },
    providers::{
        emby::{Clock, EmbyHttpRequest, EmbyHttpResponse, EmbyHttpTransport},
        ProviderKind, ServerProfile,
    },
};
use serde_json::{json, Value};

#[test]
fn playback_open_resolves_first_provider_source_without_exposing_url_to_react() {
    let backend = Arc::new(FakeMpvBackend::default());
    let state = test_state(
        vec![
            FakeResponse::json(
                200,
                json!({
                    "Id": "movie-1",
                    "Name": "Demo Movie",
                    "Type": "Movie"
                }),
            ),
            FakeResponse::json(
                200,
                json!({
                    "MediaSources": [{
                        "Id": "source-1",
                        "Name": "Direct",
                        "DirectStreamUrl": "/Videos/movie-1/stream.mkv?MediaSourceId=source-1",
                        "SupportsDirectStream": true
                    }]
                }),
            ),
        ],
        backend.clone(),
    );
    let profile = seed_profile_with_token(&state);
    let host = Arc::new(FakePlaybackHost::default());

    let session = playback::open_for_state(
        &state,
        host,
        PlayerOpenRequest {
            server_id: profile.id,
            item_id: "movie-1".into(),
            media_source_id: None,
        },
    )
    .expect("open playback");

    assert_eq!(session.item_id, "movie-1");
    assert_eq!(session.state, lumi_lib::player::PlayerState::Opening);
    let opened = backend.wait_for_opened();
    assert_eq!(opened.media_url, "http://localhost:8096/Videos/movie-1/stream.mkv?MediaSourceId=source-1&api_key=token-value");
}

#[test]
fn playback_open_resolves_container_to_first_playable_descendant() {
    let backend = Arc::new(FakeMpvBackend::default());
    let state = test_state(
        vec![
            FakeResponse::json(
                200,
                json!({
                    "Id": "library-1",
                    "Name": "Movies",
                    "Type": "CollectionFolder",
                    "CollectionType": "movies"
                }),
            ),
            FakeResponse::json(
                200,
                json!({
                    "Items": [{
                        "Id": "movie-1",
                        "Name": "Demo Movie",
                        "Type": "Movie"
                    }],
                    "TotalRecordCount": 1
                }),
            ),
            FakeResponse::json(
                200,
                json!({
                    "MediaSources": [{
                        "Id": "source-1",
                        "Name": "Direct",
                        "DirectStreamUrl": "/Videos/movie-1/stream.mkv",
                        "SupportsDirectStream": true
                    }]
                }),
            ),
        ],
        backend.clone(),
    );
    let profile = seed_profile_with_token(&state);

    let session = playback::open_for_state(
        &state,
        Arc::new(FakePlaybackHost::default()),
        PlayerOpenRequest {
            server_id: profile.id,
            item_id: "library-1".into(),
            media_source_id: None,
        },
    )
    .expect("open container playback");

    assert_eq!(session.item_id, "movie-1");
    let opened = backend.wait_for_opened();
    assert_eq!(
        opened.media_url,
        "http://localhost:8096/Videos/movie-1/stream.mkv?api_key=token-value"
    );
}

#[test]
fn playback_open_uses_transcoding_source_when_direct_stream_is_unavailable() {
    let backend = Arc::new(FakeMpvBackend::default());
    let state = test_state(
        vec![
            FakeResponse::json(
                200,
                json!({
                    "Id": "movie-1",
                    "Name": "Demo Movie",
                    "Type": "Movie"
                }),
            ),
            FakeResponse::json(
                200,
                json!({
                    "MediaSources": [{
                        "Id": "source-1",
                        "Name": "Transcode",
                        "TranscodingUrl": "/Videos/movie-1/master.m3u8?MediaSourceId=source-1",
                        "SupportsDirectStream": false
                    }]
                }),
            ),
        ],
        backend.clone(),
    );
    let profile = seed_profile_with_token(&state);

    playback::open_for_state(
        &state,
        Arc::new(FakePlaybackHost::default()),
        PlayerOpenRequest {
            server_id: profile.id,
            item_id: "movie-1".into(),
            media_source_id: None,
        },
    )
    .expect("open transcoded playback");

    let opened = backend.wait_for_opened();
    assert_eq!(
        opened.media_url,
        "http://localhost:8096/Videos/movie-1/master.m3u8?MediaSourceId=source-1&api_key=token-value"
    );
}

#[test]
fn playback_open_does_not_duplicate_existing_api_key() {
    let backend = Arc::new(FakeMpvBackend::default());
    let state = test_state(
        vec![
            FakeResponse::json(
                200,
                json!({
                    "Id": "movie-1",
                    "Name": "Demo Movie",
                    "Type": "Movie"
                }),
            ),
            FakeResponse::json(
                200,
                json!({
                    "MediaSources": [{
                        "Id": "source-1",
                        "Name": "Direct",
                        "DirectStreamUrl": "/Videos/movie-1/stream.mkv?api_key=token-value",
                        "SupportsDirectStream": true
                    }]
                }),
            ),
        ],
        backend.clone(),
    );
    let profile = seed_profile_with_token(&state);

    playback::open_for_state(
        &state,
        Arc::new(FakePlaybackHost::default()),
        PlayerOpenRequest {
            server_id: profile.id,
            item_id: "movie-1".into(),
            media_source_id: None,
        },
    )
    .expect("open playback");

    assert_eq!(
        backend.wait_for_opened().media_url,
        "http://localhost:8096/Videos/movie-1/stream.mkv?api_key=token-value"
    );
}

#[test]
fn playback_open_resolves_file_protocol_sources_to_emby_static_streams() {
    let backend = Arc::new(FakeMpvBackend::default());
    let state = test_state(
        vec![
            FakeResponse::json(
                200,
                json!({
                    "Id": "movie-1",
                    "Name": "Demo Movie",
                    "Type": "Movie"
                }),
            ),
            FakeResponse::json(
                200,
                json!({
                    "MediaSources": [{
                        "Id": "source-1",
                        "Name": "720p - 2 Mbps",
                        "Container": "mp4",
                        "Protocol": "File",
                        "Path": "/media/movies/demo.mp4",
                        "SupportsDirectPlay": true,
                        "SupportsDirectStream": true,
                        "SupportsTranscoding": true
                    }]
                }),
            ),
        ],
        backend.clone(),
    );
    let profile = seed_profile_with_token(&state);

    playback::open_for_state(
        &state,
        Arc::new(FakePlaybackHost::default()),
        PlayerOpenRequest {
            server_id: profile.id,
            item_id: "movie-1".into(),
            media_source_id: None,
        },
    )
    .expect("file protocol sources should resolve through Emby static streams");

    let opened = backend.wait_for_opened();
    assert_eq!(
        opened.media_url,
        "http://localhost:8096/Videos/movie-1/stream?static=true&MediaSourceId=source-1&api_key=token-value"
    );
}

#[test]
fn playback_open_returns_no_source_for_empty_container_without_creating_window() {
    let backend = Arc::new(FakeMpvBackend::default());
    let state = test_state(
        vec![
            FakeResponse::json(
                200,
                json!({
                    "Id": "library-1",
                    "Name": "Movies",
                    "Type": "CollectionFolder",
                    "CollectionType": "movies"
                }),
            ),
            FakeResponse::json(
                200,
                json!({
                    "Items": [],
                    "TotalRecordCount": 0
                }),
            ),
        ],
        backend.clone(),
    );
    let profile = seed_profile_with_token(&state);

    let error = playback::open_for_state(
        &state,
        Arc::new(FakePlaybackHost::default()),
        PlayerOpenRequest {
            server_id: profile.id,
            item_id: "library-1".into(),
            media_source_id: None,
        },
    )
    .expect_err("empty container should fail");

    assert_eq!(error.code(), "playback.no_source");
    assert!(error.recoverable());
    assert!(backend.opened.lock().unwrap().is_empty());
}

#[test]
fn playback_open_event_failure_does_not_expose_stream_url() {
    let backend = Arc::new(FakeMpvBackend::default());
    let state = test_state(
        vec![
            FakeResponse::json(
                200,
                json!({
                    "Id": "movie-1",
                    "Name": "Demo Movie",
                    "Type": "Movie"
                }),
            ),
            FakeResponse::json(
                200,
                json!({
                    "MediaSources": [{
                        "Id": "source-1",
                        "Name": "Direct",
                        "DirectStreamUrl": "/Videos/movie-1/stream.mkv?api_key=secret-token",
                        "SupportsDirectStream": true
                    }]
                }),
            ),
        ],
        backend.clone(),
    );
    let profile = seed_profile_with_token(&state);

    let error = playback::open_for_state(
        &state,
        Arc::new(FailingPlaybackHost),
        PlayerOpenRequest {
            server_id: profile.id,
            item_id: "movie-1".into(),
            media_source_id: None,
        },
    )
    .expect_err("event failure should fail");

    let rendered = format!("{error}");
    assert_eq!(error.code(), "playback.window_failed");
    assert!(!rendered.contains("secret-token"));
    assert!(!rendered.contains("stream.mkv"));
    assert!(backend.opened.lock().unwrap().is_empty());
}

#[test]
fn playback_open_returns_source_errors_before_creating_player_session() {
    let backend = Arc::new(FakeMpvBackend::default());
    let state = test_state(
        vec![
            FakeResponse::json(
                200,
                json!({
                    "Id": "movie-1",
                    "Name": "Demo Movie",
                    "Type": "Movie"
                }),
            ),
            FakeResponse::json(
                200,
                json!({
                    "MediaSources": [{
                        "Id": "source-1",
                        "Name": "Direct",
                        "DirectStreamUrl": "/Videos/movie-1/stream.mkv",
                        "SupportsDirectStream": true
                    }]
                }),
            ),
        ],
        backend.clone(),
    );
    let profile = seed_profile_with_token(&state);

    let error = playback::open_for_state(
        &state,
        Arc::new(FakePlaybackHost::default()),
        PlayerOpenRequest {
            server_id: profile.id,
            item_id: "movie-1".into(),
            media_source_id: Some("missing-source".into()),
        },
    )
    .expect_err("missing source should fail");

    assert_eq!(error.code(), "playback.source_not_found");
    assert!(error.recoverable());
    assert!(backend.opened.lock().unwrap().is_empty());
}

#[test]
fn playback_open_resolved_target_opens_without_provider_lookup() {
    let backend = Arc::new(FakeMpvBackend::default());
    let state = test_state(Vec::new(), backend.clone());
    let host = Arc::new(FakePlaybackHost::default());

    let session = playback::open_resolved_for_state(
        &state,
        host,
        PlayerOpenRequest {
            server_id: "server-1".into(),
            item_id: "library-1".into(),
            media_source_id: Some("source-from-request".into()),
        },
        playback::ResolvedPlaybackTarget {
            item_id: "movie-1".into(),
            source: ResolvedPlaybackSource {
                id: "source-1".into(),
                url: "http://localhost:8096/Videos/movie-1/stream.mkv?api_key=token-value".into(),
            },
        },
    )
    .expect("open playback from resolved target");

    assert_eq!(session.server_id, "server-1");
    assert_eq!(session.item_id, "movie-1");
    assert_eq!(session.state, lumi_lib::player::PlayerState::Opening);
    let opened = backend.wait_for_opened();
    assert_eq!(
        opened.media_url,
        "http://localhost:8096/Videos/movie-1/stream.mkv?api_key=token-value"
    );
}

#[test]
fn playback_open_resolved_target_passes_window_target_to_backend() {
    let backend = Arc::new(FakeMpvBackend::default());
    let state = test_state(Vec::new(), backend.clone());
    let host = Arc::new(FakePlaybackHost {
        window_id: Some(31337),
    });

    let session = playback::open_resolved_for_state(
        &state,
        host,
        PlayerOpenRequest {
            server_id: "server-1".into(),
            item_id: "movie-1".into(),
            media_source_id: None,
        },
        playback::ResolvedPlaybackTarget {
            item_id: "movie-1".into(),
            source: ResolvedPlaybackSource {
                id: "source-1".into(),
                url: "http://localhost:8096/Videos/movie-1/stream.mkv?api_key=token-value".into(),
            },
        },
    )
    .expect("open playback with embedded window target");

    assert_eq!(session.state, lumi_lib::player::PlayerState::Opening);
    let opened = backend.wait_for_opened();
    assert_eq!(opened.window_id, Some(31337));
    assert!(!format!("{session:?}").contains("api_key=token-value"));
}

#[test]
fn playback_get_session_returns_existing_session_without_source_url() {
    let backend = Arc::new(FakeMpvBackend::default());
    let state = test_state(
        vec![
            FakeResponse::json(
                200,
                json!({
                    "Id": "movie-1",
                    "Name": "Demo Movie",
                    "Type": "Movie"
                }),
            ),
            FakeResponse::json(
                200,
                json!({
                    "MediaSources": [{
                        "Id": "source-1",
                        "Name": "Direct",
                        "DirectStreamUrl": "/Videos/movie-1/stream.mkv?api_key=secret-token",
                        "SupportsDirectStream": true
                    }]
                }),
            ),
        ],
        backend.clone(),
    );
    let profile = seed_profile_with_token(&state);
    let host = Arc::new(FakePlaybackHost::default());
    let opened = playback::open_for_state(
        &state,
        host.clone(),
        PlayerOpenRequest {
            server_id: profile.id,
            item_id: "movie-1".into(),
            media_source_id: None,
        },
    )
    .expect("open playback");

    let loaded = playback::get_session_for_state(&state, host, &opened.id).expect("load session");

    assert_eq!(loaded, opened);
    assert!(!format!("{loaded:?}").contains("secret-token"));
    assert!(!format!("{loaded:?}").contains("stream.mkv"));
}

#[test]
fn playback_command_delegates_to_existing_player_session() {
    let backend = Arc::new(FakeMpvBackend::default());
    let state = test_state(
        vec![
            FakeResponse::json(
                200,
                json!({
                    "Id": "movie-1",
                    "Name": "Demo Movie",
                    "Type": "Movie"
                }),
            ),
            FakeResponse::json(
                200,
                json!({
                    "MediaSources": [{
                        "Id": "source-1",
                        "Name": "Direct",
                        "DirectStreamUrl": "/Videos/movie-1/stream.mkv",
                        "SupportsDirectStream": true
                    }]
                }),
            ),
        ],
        backend.clone(),
    );
    let profile = seed_profile_with_token(&state);
    let host = Arc::new(FakePlaybackHost::default());
    let session = playback::open_for_state(
        &state,
        host.clone(),
        PlayerOpenRequest {
            server_id: profile.id,
            item_id: "movie-1".into(),
            media_source_id: None,
        },
    )
    .expect("open playback");

    let updated = playback::command_for_state(
        &state,
        host,
        playback::PlaybackCommandRequest {
            session_id: session.id,
            command: PlaybackCommand::Pause,
        },
    )
    .expect("pause playback");

    assert_eq!(updated.state, lumi_lib::player::PlayerState::Paused);
    assert_eq!(backend.commands.lock().unwrap().len(), 1);
}

#[test]
fn windows_video_host_is_visible_before_mpv_ready_events() {
    let playback_source =
        std::fs::read_to_string("src/commands/playback.rs").expect("read playback command source");

    assert!(
        playback_source.contains("WS_CHILD | WS_VISIBLE | WS_CLIPSIBLINGS"),
        "Windows mpv wid host must be visible as soon as it is created so startup does not wait on the Ready event"
    );
}

#[test]
fn windows_video_host_is_created_on_tauri_main_thread() {
    let playback_source =
        std::fs::read_to_string("src/commands/playback.rs").expect("read playback command source");

    assert!(
        playback_source.contains("create_video_host_window_on_main_thread(app, window"),
        "Windows mpv child windows must be created on Tauri's main thread so their message handling stays attached to the UI event loop"
    );
    assert!(
        playback_source.contains("app.run_on_main_thread(move ||"),
        "The player window creation boundary must dispatch the native window work to Tauri's main thread"
    );
}

#[test]
fn windows_player_uses_native_window_with_child_controls_webview() {
    let playback_source =
        std::fs::read_to_string("src/commands/playback.rs").expect("read playback command source");

    assert!(
        playback_source.contains("WindowBuilder::new"),
        "The player host must be a native Tauri window so mpv renders into a native HWND"
    );
    assert!(
        playback_source.contains("WebviewBuilder::new"),
        "The React player controls should be loaded as a child webview inside the native player window"
    );
    assert!(
        playback_source.contains(".add_child("),
        "The controls webview must be attached to the native window instead of replacing the native mpv host"
    );
    assert!(
        !playback_source.contains("WebviewWindowBuilder"),
        "The player host must not regress to a WebviewWindowBuilder window that can cover native mpv output"
    );
}

#[test]
fn windows_video_host_uses_reported_video_region_bounds() {
    let playback_source =
        std::fs::read_to_string("src/commands/playback.rs").expect("read playback command source");

    assert!(
        playback_source.contains("PlaybackSurfaceBounds"),
        "React must report the measured video region bounds instead of Rust guessing from a fixed controls height"
    );
    assert!(
        playback_source.contains("playback_update_surface_bounds"),
        "The player window must have a command boundary for resizing the native mpv host to the measured video region"
    );
    assert!(
        playback_source.contains("PLAYER_CONTROLS_HEIGHT"),
        "The native window owns a stable child controls webview height so the mpv surface uses only the remaining native video area"
    );
    assert!(
        playback_source.contains(
            "position_video_host(child, bounds.x, bounds.y, bounds.width, bounds.height)"
        ),
        "The Windows child HWND must be positioned using the reported x/y/width/height bounds"
    );
}

fn test_state(responses: Vec<FakeResponse>, backend: Arc<dyn MpvBackend>) -> AppState {
    let database = Database::open_in_memory().expect("open database");
    database.initialize().expect("initialize database");
    AppState::with_services_and_player(
        Arc::new(LocalStore::new(database)),
        Arc::new(MemoryCredentialStore::default()),
        Arc::new(FakeEmbyTransport::new(responses)),
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
        "2026-05-07T00:00:00Z".into()
    }
}

#[derive(Debug, Clone)]
struct FakeResponse {
    status: u16,
    body: Value,
}

impl FakeResponse {
    fn json(status: u16, body: Value) -> Self {
        Self { status, body }
    }
}

#[derive(Default)]
struct FakeEmbyTransport {
    responses: Mutex<Vec<FakeResponse>>,
}

impl FakeEmbyTransport {
    fn new(responses: Vec<FakeResponse>) -> Self {
        Self {
            responses: Mutex::new(responses.into_iter().rev().collect()),
        }
    }
}

impl EmbyHttpTransport for FakeEmbyTransport {
    fn send(&self, _request: EmbyHttpRequest) -> AppResult<EmbyHttpResponse> {
        let response = self.responses.lock().unwrap().pop().expect("fake response");

        Ok(EmbyHttpResponse {
            status: response.status,
            body: response.body,
            headers: Vec::new(),
        })
    }
}

#[derive(Default)]
struct FakePlaybackHost {
    window_id: Option<i64>,
}

impl PlaybackHost for FakePlaybackHost {
    fn create_player_window(&self, _session_id: &str) -> AppResult<Option<i64>> {
        Ok(self.window_id)
    }

    fn emit_state_changed(&self, _session: &PlayerSession) -> AppResult<()> {
        Ok(())
    }

    fn emit_position(&self, _event: &PlaybackPositionEvent) -> AppResult<()> {
        Ok(())
    }

    fn emit_error(&self, _event: &PlaybackErrorEvent) -> AppResult<()> {
        Ok(())
    }

    fn show_video_surface(&self, _session_id: &str) -> AppResult<()> {
        Ok(())
    }

    fn destroy_video_surface(&self, _session_id: &str) -> AppResult<()> {
        Ok(())
    }
}

struct FailingPlaybackHost;

impl PlaybackHost for FailingPlaybackHost {
    fn create_player_window(&self, _session_id: &str) -> AppResult<Option<i64>> {
        Err(lumi_lib::player::playback_window_failed(
            "native event target was unavailable",
        ))
    }

    fn emit_state_changed(&self, _session: &PlayerSession) -> AppResult<()> {
        Err(lumi_lib::player::playback_window_failed(
            "native event target was unavailable",
        ))
    }

    fn emit_position(&self, _event: &PlaybackPositionEvent) -> AppResult<()> {
        Ok(())
    }

    fn emit_error(&self, _event: &PlaybackErrorEvent) -> AppResult<()> {
        Ok(())
    }

    fn show_video_surface(&self, _session_id: &str) -> AppResult<()> {
        Ok(())
    }

    fn destroy_video_surface(&self, _session_id: &str) -> AppResult<()> {
        Ok(())
    }
}

#[derive(Default)]
struct FakeMpvBackend {
    opened: Mutex<Vec<MpvOpenRequest>>,
    commands: Mutex<Vec<(String, PlaybackCommand)>>,
    opened_changed: Condvar,
}

impl MpvBackend for FakeMpvBackend {
    fn open(&self, request: MpvOpenRequest, _event_sink: Arc<dyn MpvEventSink>) -> AppResult<()> {
        self.opened.lock().unwrap().push(request);
        self.opened_changed.notify_all();
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

impl FakeMpvBackend {
    fn wait_for_opened(&self) -> MpvOpenRequest {
        let deadline = Instant::now() + Duration::from_secs(2);
        let mut opened = self.opened.lock().unwrap();
        loop {
            if let Some(request) = opened.first() {
                return request.clone();
            }
            let now = Instant::now();
            assert!(now < deadline, "timed out waiting for backend open");
            let timeout = deadline.saturating_duration_since(now);
            opened = self.opened_changed.wait_timeout(opened, timeout).unwrap().0;
        }
    }
}
