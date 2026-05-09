use std::{
    sync::{
        atomic::{AtomicUsize, Ordering},
        mpsc, Arc, Condvar, Mutex,
    },
    thread,
    time::{Duration, Instant},
};

use lumi_lib::{
    errors::{AppError, AppResult},
    player::{
        MpvBackend, MpvEventSink, MpvOpenRequest, MpvPlaybackEvent, NativePlayerService,
        PlaybackCommand, PlaybackErrorEvent, PlaybackHost, PlaybackPositionEvent,
        PlaybackProgressReporter, PlayerOpenRequest, PlayerService, PlayerSession, PlayerState,
        ResolvedPlaybackSource,
    },
    providers::PlaybackProgressUpdate,
};

#[test]
fn native_player_service_returns_opening_then_loads_source_asynchronously() {
    let host = Arc::new(FakePlaybackHost::default());
    let backend = Arc::new(BlockingMpvBackend::default());
    let service = NativePlayerService::new(host.clone(), backend.clone());

    let session = service
        .open(
            PlayerOpenRequest {
                server_id: "server-1".into(),
                item_id: "movie-1".into(),
                media_source_id: Some("source-1".into()),
            },
            ResolvedPlaybackSource {
                id: "source-1".into(),
                url: "http://localhost/stream.mkv?api_key=secret".into(),
            },
        )
        .expect("open playback");

    assert_eq!(session.state, PlayerState::Opening);
    assert_eq!(session.server_id, "server-1");
    assert_eq!(session.item_id, "movie-1");

    let open = backend.wait_for_open_request();
    assert_eq!(open.session_id, session.id);
    assert_eq!(open.media_url, "http://localhost/stream.mkv?api_key=secret");
    assert_eq!(open.window_id, None);

    backend.complete_open(Ok(()));

    assert_eq!(
        host.wait_for_state(PlayerState::Buffering).state,
        PlayerState::Buffering
    );
    assert!(!host.has_state(PlayerState::Playing));
}

#[test]
fn native_player_service_marks_playing_only_after_backend_ready_event() {
    let host = Arc::new(FakePlaybackHost::default());
    let backend = Arc::new(BlockingMpvBackend::default());
    let service = NativePlayerService::new(host.clone(), backend.clone());

    service
        .open(
            PlayerOpenRequest {
                server_id: "server-1".into(),
                item_id: "movie-1".into(),
                media_source_id: None,
            },
            ResolvedPlaybackSource {
                id: "source-1".into(),
                url: "http://localhost/stream.mkv".into(),
            },
        )
        .expect("open playback");

    backend.wait_for_open_request();
    backend.complete_open(Ok(()));
    assert_eq!(
        host.wait_for_state(PlayerState::Buffering).state,
        PlayerState::Buffering
    );
    assert!(!host.has_state(PlayerState::Playing));

    backend.emit_event(MpvPlaybackEvent::Ready);

    assert_eq!(
        host.wait_for_state(PlayerState::Playing).state,
        PlayerState::Playing
    );
    assert!(host.shown_surfaces.lock().unwrap().is_empty());
}

#[test]
fn native_player_service_does_not_regress_ready_during_open_back_to_buffering() {
    let host = Arc::new(FakePlaybackHost::default());
    let backend = Arc::new(ReadyDuringOpenMpvBackend::default());
    let service = NativePlayerService::new(host.clone(), backend);

    let session = service
        .open(
            PlayerOpenRequest {
                server_id: "server-1".into(),
                item_id: "movie-1".into(),
                media_source_id: None,
            },
            ResolvedPlaybackSource {
                id: "source-1".into(),
                url: "http://localhost/stream.mkv".into(),
            },
        )
        .expect("open playback");

    assert_eq!(session.state, PlayerState::Opening);
    assert_eq!(
        host.wait_for_state(PlayerState::Playing).state,
        PlayerState::Playing
    );
    thread::sleep(Duration::from_millis(25));
    assert_eq!(
        service.session(&session.id).unwrap().state,
        PlayerState::Playing
    );
    assert!(!host.has_state(PlayerState::Buffering));
}

#[test]
fn native_player_service_ignores_duplicate_ready_events() {
    let host = Arc::new(FakePlaybackHost::default());
    let backend = Arc::new(BlockingMpvBackend::default());
    let service = NativePlayerService::new(host.clone(), backend.clone());

    service
        .open(
            PlayerOpenRequest {
                server_id: "server-1".into(),
                item_id: "movie-1".into(),
                media_source_id: None,
            },
            ResolvedPlaybackSource {
                id: "source-1".into(),
                url: "http://localhost/stream.mkv".into(),
            },
        )
        .expect("open playback");

    backend.wait_for_open_request();
    backend.complete_open(Ok(()));
    host.wait_for_state(PlayerState::Buffering);
    backend.emit_event(MpvPlaybackEvent::Ready);
    backend.emit_event(MpvPlaybackEvent::Ready);

    assert_eq!(
        host.wait_for_state(PlayerState::Playing).state,
        PlayerState::Playing
    );
    thread::sleep(Duration::from_millis(25));
    assert!(host.shown_surfaces.lock().unwrap().is_empty());
}

#[test]
fn native_player_service_reports_async_backend_load_errors_as_events() {
    let host = Arc::new(FakePlaybackHost::default());
    let backend = Arc::new(BlockingMpvBackend::default());
    let service = NativePlayerService::new(host.clone(), backend.clone());

    let session = service
        .open(
            PlayerOpenRequest {
                server_id: "server-1".into(),
                item_id: "movie-1".into(),
                media_source_id: None,
            },
            ResolvedPlaybackSource {
                id: "source-1".into(),
                url: "http://localhost/stream.mkv?api_key=secret".into(),
            },
        )
        .expect("open playback");

    backend.wait_for_open_request();
    backend.complete_open(Ok(()));
    host.wait_for_state(PlayerState::Buffering);
    backend.emit_event(MpvPlaybackEvent::Error(playback_test_error()));

    let error = host.wait_for_error("playback.test_open_failed");
    assert_eq!(error.session_id.as_deref(), Some(session.id.as_str()));
    assert!(!format!("{error:?}").contains("api_key=secret"));
    assert_eq!(
        host.wait_for_state(PlayerState::Error).state,
        PlayerState::Error
    );
    assert_eq!(
        host.destroyed_surfaces.lock().unwrap().as_slice(),
        &[session.id]
    );
}

#[test]
fn native_player_service_open_does_not_wait_for_blocked_backend() {
    let host = Arc::new(FakePlaybackHost::default());
    let backend = Arc::new(BlockingMpvBackend::default());
    let service = NativePlayerService::new(host, backend.clone());
    let (result_tx, result_rx) = mpsc::channel();

    let handle = thread::spawn(move || {
        let result = service.open(
            PlayerOpenRequest {
                server_id: "server-1".into(),
                item_id: "movie-1".into(),
                media_source_id: None,
            },
            ResolvedPlaybackSource {
                id: "source-1".into(),
                url: "http://localhost/stream.mkv".into(),
            },
        );
        result_tx.send(result).expect("send open result");
    });

    backend.wait_for_open_request();
    let immediate = result_rx.recv_timeout(Duration::from_millis(50));
    backend.complete_open(Ok(()));
    handle.join().expect("open caller thread should finish");

    let session = immediate
        .expect("open should return before backend finishes")
        .expect("open should create an opening session");
    assert_eq!(session.state, PlayerState::Opening);
}

#[test]
fn native_player_service_passes_embedded_window_target_to_backend() {
    let host = Arc::new(FakePlaybackHost::with_window_id(4242));
    let backend = Arc::new(BlockingMpvBackend::default());
    let service = NativePlayerService::new(host, backend.clone());

    let session = service
        .open(
            PlayerOpenRequest {
                server_id: "server-1".into(),
                item_id: "movie-1".into(),
                media_source_id: None,
            },
            ResolvedPlaybackSource {
                id: "source-1".into(),
                url: "http://localhost/stream.mkv".into(),
            },
        )
        .expect("open playback");

    assert_eq!(session.state, PlayerState::Opening);
    let open = backend.wait_for_open_request();
    assert_eq!(open.window_id, Some(4242));
    backend.complete_open(Ok(()));
}

#[test]
fn native_player_service_returns_window_errors_before_opening_backend() {
    let host = Arc::new(FakePlaybackHost::failing_window());
    let backend = Arc::new(FakeMpvBackend::default());
    let service = NativePlayerService::new(host.clone(), backend.clone());

    let error = service
        .open(
            PlayerOpenRequest {
                server_id: "server-1".into(),
                item_id: "movie-1".into(),
                media_source_id: None,
            },
            ResolvedPlaybackSource {
                id: "source-1".into(),
                url: "http://localhost/stream.mkv?api_key=secret".into(),
            },
        )
        .expect_err("window creation failure should reject playback open");

    assert_eq!(error.code(), "playback.window_failed");
    assert!(backend.opened.lock().unwrap().is_empty());
    assert!(!format!("{error}").contains("api_key=secret"));
    let errors = host.errors.lock().unwrap();
    assert_eq!(
        errors.last().expect("window failure event").code,
        "playback.window_failed"
    );
}

#[test]
fn native_player_service_returns_existing_sessions_without_source_url() {
    let host = Arc::new(FakePlaybackHost::default());
    let backend = Arc::new(BlockingMpvBackend::default());
    let service = NativePlayerService::new(host, backend.clone());

    let opened = service
        .open(
            PlayerOpenRequest {
                server_id: "server-1".into(),
                item_id: "movie-1".into(),
                media_source_id: None,
            },
            ResolvedPlaybackSource {
                id: "source-1".into(),
                url: "http://localhost/stream.mkv?api_key=secret".into(),
            },
        )
        .expect("open playback");

    let loaded = service.session(&opened.id).expect("load session");

    assert_eq!(loaded, opened);
    assert!(!format!("{loaded:?}").contains("api_key=secret"));
    backend.complete_open(Ok(()));
}

#[test]
fn native_player_service_reports_backend_open_errors_as_events() {
    let host = Arc::new(FakePlaybackHost::default());
    let backend = Arc::new(BlockingMpvBackend::default());
    let service = NativePlayerService::new(host.clone(), backend.clone());

    let session = service
        .open(
            PlayerOpenRequest {
                server_id: "server-1".into(),
                item_id: "movie-1".into(),
                media_source_id: None,
            },
            ResolvedPlaybackSource {
                id: "source-1".into(),
                url: "http://localhost/stream.mkv?api_key=secret".into(),
            },
        )
        .expect("open playback");

    assert_eq!(session.state, PlayerState::Opening);
    backend.wait_for_open_request();
    backend.complete_open(Err(playback_test_error()));

    let error = host.wait_for_error("playback.test_open_failed");
    assert_eq!(error.session_id.as_deref(), Some(session.id.as_str()));
    assert!(!format!("{error:?}").contains("api_key=secret"));
    assert_eq!(
        host.wait_for_state(PlayerState::Error).state,
        PlayerState::Error
    );
}

#[test]
fn native_player_service_close_during_opening_prevents_late_playing_state() {
    let host = Arc::new(FakePlaybackHost::default());
    let backend = Arc::new(BlockingMpvBackend::default());
    let service = NativePlayerService::new(host.clone(), backend.clone());

    let session = service
        .open(
            PlayerOpenRequest {
                server_id: "server-1".into(),
                item_id: "movie-1".into(),
                media_source_id: None,
            },
            ResolvedPlaybackSource {
                id: "source-1".into(),
                url: "http://localhost/stream.mkv".into(),
            },
        )
        .expect("open playback");

    backend.wait_for_open_request();
    let closed = service.close(&session.id).expect("close opening playback");
    assert_eq!(closed.state, PlayerState::Closed);

    backend.complete_open(Ok(()));
    backend.wait_for_close_count(1);

    let states = host.states.lock().unwrap();
    assert!(!states
        .iter()
        .any(|state| state.state == PlayerState::Playing));
    assert_eq!(
        states.last().expect("closed state event").state,
        PlayerState::Closed
    );

    drop(states);
    backend.emit_event(MpvPlaybackEvent::Ready);
    let states = host.states.lock().unwrap();
    assert!(!states
        .iter()
        .any(|state| state.state == PlayerState::Playing));
}

#[test]
fn native_player_service_close_returns_before_backend_teardown_finishes() {
    let host = Arc::new(FakePlaybackHost::default());
    let backend = Arc::new(HangingCloseMpvBackend::default());
    let service = NativePlayerService::new(host.clone(), backend.clone());

    let session = service
        .open(
            PlayerOpenRequest {
                server_id: "server-1".into(),
                item_id: "movie-1".into(),
                media_source_id: None,
            },
            ResolvedPlaybackSource {
                id: "source-1".into(),
                url: "http://localhost/stream.mkv".into(),
            },
        )
        .expect("open playback");

    let (result_tx, result_rx) = mpsc::channel();
    let session_id = session.id.clone();
    thread::spawn(move || {
        result_tx
            .send(service.close(&session_id))
            .expect("send close result");
    });

    let closed = result_rx
        .recv_timeout(Duration::from_millis(100))
        .expect("close should not wait for backend teardown")
        .expect("close playback");

    assert_eq!(closed.state, PlayerState::Closed);
    assert_eq!(
        host.states.lock().unwrap().last().map(|state| state.state),
        Some(PlayerState::Closed)
    );
    assert_eq!(
        host.destroyed_surfaces.lock().unwrap().as_slice(),
        &[session.id.clone()]
    );
    backend.wait_for_background_close();
    assert_eq!(backend.position_calls.load(Ordering::SeqCst), 0);
}

#[test]
fn native_player_service_close_returns_before_final_progress_finishes() {
    let host = Arc::new(FakePlaybackHost::default());
    let backend = Arc::new(FakeMpvBackend::with_position(96));
    let reporter = Arc::new(HangingProgressReporter::default());
    let service =
        NativePlayerService::with_progress_reporter(host.clone(), backend, reporter.clone());

    let session = service
        .open(
            PlayerOpenRequest {
                server_id: "server-1".into(),
                item_id: "movie-1".into(),
                media_source_id: None,
            },
            ResolvedPlaybackSource {
                id: "source-1".into(),
                url: "http://localhost/stream.mkv".into(),
            },
        )
        .expect("open playback");
    service
        .command(
            &session.id,
            PlaybackCommand::Seek {
                position_seconds: 15,
            },
        )
        .expect("seed progress position");

    let (result_tx, result_rx) = mpsc::channel();
    let session_id = session.id.clone();
    thread::spawn(move || {
        result_tx
            .send(service.close(&session_id))
            .expect("send close result");
    });

    let closed = result_rx
        .recv_timeout(Duration::from_millis(100))
        .expect("close should not wait for final progress reporting")
        .expect("close playback");

    assert_eq!(closed.state, PlayerState::Closed);
    assert_eq!(
        host.states.lock().unwrap().last().map(|state| state.state),
        Some(PlayerState::Closed)
    );
    reporter.wait_for_report();
}

#[test]
fn native_player_service_close_command_returns_before_backend_teardown_finishes() {
    let host = Arc::new(FakePlaybackHost::default());
    let backend = Arc::new(HangingCloseMpvBackend::default());
    let service = NativePlayerService::new(host, backend.clone());

    let session = service
        .open(
            PlayerOpenRequest {
                server_id: "server-1".into(),
                item_id: "movie-1".into(),
                media_source_id: None,
            },
            ResolvedPlaybackSource {
                id: "source-1".into(),
                url: "http://localhost/stream.mkv".into(),
            },
        )
        .expect("open playback");

    let (result_tx, result_rx) = mpsc::channel();
    let session_id = session.id.clone();
    thread::spawn(move || {
        result_tx
            .send(service.command(&session_id, PlaybackCommand::Close))
            .expect("send close command result");
    });

    let closed = result_rx
        .recv_timeout(Duration::from_millis(100))
        .expect("close command should not wait for backend teardown")
        .expect("close playback through command");

    assert_eq!(closed.state, PlayerState::Closed);
    backend.wait_for_background_close();
}

#[test]
fn native_player_service_maps_commands_and_closes_sessions() {
    let host = Arc::new(FakePlaybackHost::default());
    let backend = Arc::new(FakeMpvBackend::default());
    let service = NativePlayerService::new(host.clone(), backend.clone());

    let session = service
        .open(
            PlayerOpenRequest {
                server_id: "server-1".into(),
                item_id: "movie-1".into(),
                media_source_id: None,
            },
            ResolvedPlaybackSource {
                id: "source-1".into(),
                url: "http://localhost/stream.mkv".into(),
            },
        )
        .expect("open playback");

    let paused = service
        .command(&session.id, PlaybackCommand::Pause)
        .expect("pause playback");
    assert_eq!(paused.state, PlayerState::Paused);

    let seeked = service
        .command(
            &session.id,
            PlaybackCommand::Seek {
                position_seconds: 120,
            },
        )
        .expect("seek playback");
    assert_eq!(seeked.position_seconds, 120);

    service
        .command(&session.id, PlaybackCommand::SetVolume { volume: 40 })
        .expect("set volume");

    let closed = service.close(&session.id).expect("close playback");
    assert_eq!(closed.state, PlayerState::Closed);
    backend.wait_for_close_count(1);

    let commands = backend.commands.lock().unwrap();
    assert!(commands.contains(&("session-1".into(), PlaybackCommand::Pause)));
    assert!(commands.contains(&(
        "session-1".into(),
        PlaybackCommand::Seek {
            position_seconds: 120,
        },
    )));
    assert!(commands.contains(&(
        "session-1".into(),
        PlaybackCommand::SetVolume { volume: 40 },
    )));
    assert!(
        commands
            .iter()
            .any(|(_, command)| matches!(command, PlaybackCommand::Close)),
        "close should be sent to the backend at least once"
    );

    let positions = host.positions.lock().unwrap();
    assert_eq!(
        positions.last().expect("position event").position_seconds,
        120
    );
}

#[test]
fn native_player_service_reports_throttled_progress_and_final_position() {
    let host = Arc::new(FakePlaybackHost::default());
    let backend = Arc::new(FakeMpvBackend::with_position(96));
    let reporter = Arc::new(FakeProgressReporter::default());
    let service = NativePlayerService::with_progress_reporter(host, backend, reporter.clone());

    let session = service
        .open(
            PlayerOpenRequest {
                server_id: "server-1".into(),
                item_id: "movie-1".into(),
                media_source_id: None,
            },
            ResolvedPlaybackSource {
                id: "source-1".into(),
                url: "http://localhost/stream.mkv".into(),
            },
        )
        .expect("open playback");

    service
        .command(
            &session.id,
            PlaybackCommand::Seek {
                position_seconds: 15,
            },
        )
        .expect("first progress");
    service
        .command(
            &session.id,
            PlaybackCommand::Seek {
                position_seconds: 20,
            },
        )
        .expect("throttled progress");
    service
        .command(
            &session.id,
            PlaybackCommand::Seek {
                position_seconds: 46,
            },
        )
        .expect("next progress interval");
    service.close(&session.id).expect("close playback");

    reporter.wait_for_reports(3);
    let reports = reporter.reports.lock().unwrap();
    assert_eq!(
        reports
            .iter()
            .map(|report| (report.position_seconds, report.is_final))
            .collect::<Vec<_>>(),
        vec![(15, false), (46, false), (46, true)]
    );
}

#[test]
fn native_player_service_returns_stable_missing_session_error() {
    let service = NativePlayerService::new(
        Arc::new(FakePlaybackHost::default()),
        Arc::new(FakeMpvBackend::default()),
    );

    let error = service
        .command("missing-session", PlaybackCommand::Pause)
        .expect_err("missing session should fail");

    assert_eq!(error.code(), "playback.session_not_found");
    assert!(error.recoverable());
}

struct FakePlaybackHost {
    states: Mutex<Vec<PlayerSession>>,
    positions: Mutex<Vec<PlaybackPositionEvent>>,
    errors: Mutex<Vec<PlaybackErrorEvent>>,
    shown_surfaces: Mutex<Vec<String>>,
    destroyed_surfaces: Mutex<Vec<String>>,
    window_result: Mutex<AppResult<Option<i64>>>,
    state_changed: Condvar,
    error_changed: Condvar,
}

impl Default for FakePlaybackHost {
    fn default() -> Self {
        Self {
            states: Mutex::new(Vec::new()),
            positions: Mutex::new(Vec::new()),
            errors: Mutex::new(Vec::new()),
            shown_surfaces: Mutex::new(Vec::new()),
            destroyed_surfaces: Mutex::new(Vec::new()),
            window_result: Mutex::new(Ok(None)),
            state_changed: Condvar::new(),
            error_changed: Condvar::new(),
        }
    }
}

impl PlaybackHost for FakePlaybackHost {
    fn create_player_window(&self, _session_id: &str) -> AppResult<Option<i64>> {
        self.window_result.lock().unwrap().clone()
    }

    fn emit_state_changed(&self, session: &PlayerSession) -> AppResult<()> {
        self.states.lock().unwrap().push(session.clone());
        self.state_changed.notify_all();
        Ok(())
    }

    fn emit_position(&self, event: &PlaybackPositionEvent) -> AppResult<()> {
        self.positions.lock().unwrap().push(event.clone());
        Ok(())
    }

    fn emit_error(&self, event: &PlaybackErrorEvent) -> AppResult<()> {
        self.errors.lock().unwrap().push(event.clone());
        self.error_changed.notify_all();
        Ok(())
    }

    fn show_video_surface(&self, session_id: &str) -> AppResult<()> {
        self.shown_surfaces.lock().unwrap().push(session_id.into());
        Ok(())
    }

    fn destroy_video_surface(&self, session_id: &str) -> AppResult<()> {
        self.destroyed_surfaces
            .lock()
            .unwrap()
            .push(session_id.into());
        Ok(())
    }
}

impl FakePlaybackHost {
    fn with_window_id(window_id: i64) -> Self {
        Self {
            window_result: Mutex::new(Ok(Some(window_id))),
            ..Default::default()
        }
    }

    fn failing_window() -> Self {
        Self {
            window_result: Mutex::new(Err(lumi_lib::player::playback_window_failed(
                "native player window was unavailable",
            ))),
            ..Default::default()
        }
    }

    fn wait_for_state(&self, state: PlayerState) -> PlayerSession {
        let deadline = Instant::now() + Duration::from_secs(2);
        let mut states = self.states.lock().unwrap();
        loop {
            if let Some(session) = states.iter().find(|session| session.state == state) {
                return session.clone();
            }
            let now = Instant::now();
            assert!(now < deadline, "timed out waiting for {state:?}");
            let timeout = deadline.saturating_duration_since(now);
            states = self.state_changed.wait_timeout(states, timeout).unwrap().0;
        }
    }

    fn wait_for_error(&self, code: &str) -> PlaybackErrorEvent {
        let deadline = Instant::now() + Duration::from_secs(2);
        let mut errors = self.errors.lock().unwrap();
        loop {
            if let Some(error) = errors.iter().find(|error| error.code == code) {
                return error.clone();
            }
            let now = Instant::now();
            assert!(now < deadline, "timed out waiting for {code}");
            let timeout = deadline.saturating_duration_since(now);
            errors = self.error_changed.wait_timeout(errors, timeout).unwrap().0;
        }
    }

    fn has_state(&self, state: PlayerState) -> bool {
        self.states
            .lock()
            .unwrap()
            .iter()
            .any(|session| session.state == state)
    }
}

#[derive(Default)]
struct FakeMpvBackend {
    opened: Mutex<Vec<MpvOpenRequest>>,
    commands: Mutex<Vec<(String, PlaybackCommand)>>,
    position_seconds: Mutex<u32>,
}

impl FakeMpvBackend {
    fn with_position(position_seconds: u32) -> Self {
        Self {
            position_seconds: Mutex::new(position_seconds),
            ..Default::default()
        }
    }

    fn wait_for_close_count(&self, expected: usize) {
        let deadline = Instant::now() + Duration::from_secs(2);
        loop {
            let count = self
                .commands
                .lock()
                .unwrap()
                .iter()
                .filter(|(_, command)| matches!(command, PlaybackCommand::Close))
                .count();
            if count >= expected {
                return;
            }
            assert!(Instant::now() < deadline, "timed out waiting for close");
            thread::sleep(Duration::from_millis(10));
        }
    }
}

impl MpvBackend for FakeMpvBackend {
    fn open(&self, request: MpvOpenRequest, _event_sink: Arc<dyn MpvEventSink>) -> AppResult<()> {
        self.opened.lock().unwrap().push(request);
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
        Ok(Some(*self.position_seconds.lock().unwrap()))
    }
}

#[derive(Default)]
struct BlockingMpvBackend {
    opened: Mutex<Vec<MpvOpenRequest>>,
    commands: Mutex<Vec<(String, PlaybackCommand)>>,
    open_started: Condvar,
    open_outcome: Mutex<Option<AppResult<()>>>,
    open_completed: Condvar,
    event_sink: Mutex<Option<(String, Arc<dyn MpvEventSink>)>>,
}

impl BlockingMpvBackend {
    fn wait_for_open_request(&self) -> MpvOpenRequest {
        let deadline = Instant::now() + Duration::from_secs(2);
        let mut opened = self.opened.lock().unwrap();
        loop {
            if let Some(request) = opened.first() {
                return request.clone();
            }
            let now = Instant::now();
            assert!(now < deadline, "timed out waiting for backend open");
            let timeout = deadline.saturating_duration_since(now);
            opened = self.open_started.wait_timeout(opened, timeout).unwrap().0;
        }
    }

    fn complete_open(&self, result: AppResult<()>) {
        *self.open_outcome.lock().unwrap() = Some(result);
        self.open_completed.notify_all();
    }

    fn emit_event(&self, event: MpvPlaybackEvent) {
        let (session_id, event_sink) = self
            .event_sink
            .lock()
            .unwrap()
            .as_ref()
            .expect("backend event sink")
            .clone();
        event_sink.on_mpv_event(&session_id, event);
    }

    fn wait_for_close_count(&self, expected: usize) {
        let deadline = Instant::now() + Duration::from_secs(2);
        loop {
            let count = self
                .commands
                .lock()
                .unwrap()
                .iter()
                .filter(|(_, command)| matches!(command, PlaybackCommand::Close))
                .count();
            if count >= expected {
                return;
            }
            assert!(Instant::now() < deadline, "timed out waiting for close");
            thread::sleep(Duration::from_millis(10));
        }
    }
}

impl MpvBackend for BlockingMpvBackend {
    fn open(&self, request: MpvOpenRequest, event_sink: Arc<dyn MpvEventSink>) -> AppResult<()> {
        *self.event_sink.lock().unwrap() = Some((request.session_id.clone(), event_sink));
        self.opened.lock().unwrap().push(request);
        self.open_started.notify_all();

        let mut outcome = self.open_outcome.lock().unwrap();
        loop {
            if let Some(result) = outcome.take() {
                return result;
            }
            outcome = self.open_completed.wait(outcome).unwrap();
        }
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
        Ok(None)
    }
}

#[derive(Default)]
struct ReadyDuringOpenMpvBackend {
    opened: Mutex<Vec<MpvOpenRequest>>,
}

impl MpvBackend for ReadyDuringOpenMpvBackend {
    fn open(&self, request: MpvOpenRequest, event_sink: Arc<dyn MpvEventSink>) -> AppResult<()> {
        self.opened.lock().unwrap().push(request.clone());
        event_sink.on_mpv_event(&request.session_id, MpvPlaybackEvent::Ready);
        Ok(())
    }

    fn command(&self, _session_id: &str, _command: PlaybackCommand) -> AppResult<()> {
        Ok(())
    }

    fn close(&self, _session_id: &str) -> AppResult<()> {
        Ok(())
    }

    fn position_seconds(&self, _session_id: &str) -> AppResult<Option<u32>> {
        Ok(None)
    }
}

#[derive(Default)]
struct HangingCloseMpvBackend {
    position_calls: AtomicUsize,
    close_started: Mutex<bool>,
    close_started_changed: Condvar,
}

impl HangingCloseMpvBackend {
    fn wait_for_background_close(&self) {
        let deadline = Instant::now() + Duration::from_secs(2);
        let mut close_started = self.close_started.lock().unwrap();
        loop {
            if *close_started {
                return;
            }
            let now = Instant::now();
            assert!(now < deadline, "timed out waiting for background close");
            let timeout = deadline.saturating_duration_since(now);
            close_started = self
                .close_started_changed
                .wait_timeout(close_started, timeout)
                .unwrap()
                .0;
        }
    }
}

impl MpvBackend for HangingCloseMpvBackend {
    fn open(&self, _request: MpvOpenRequest, _event_sink: Arc<dyn MpvEventSink>) -> AppResult<()> {
        Ok(())
    }

    fn command(&self, _session_id: &str, _command: PlaybackCommand) -> AppResult<()> {
        Ok(())
    }

    fn close(&self, _session_id: &str) -> AppResult<()> {
        *self.close_started.lock().unwrap() = true;
        self.close_started_changed.notify_all();
        thread::sleep(Duration::from_secs(30));
        Ok(())
    }

    fn position_seconds(&self, _session_id: &str) -> AppResult<Option<u32>> {
        self.position_calls.fetch_add(1, Ordering::SeqCst);
        thread::sleep(Duration::from_secs(30));
        Ok(Some(123))
    }
}

fn playback_test_error() -> AppError {
    AppError::new("playback.test_open_failed", "Playback backend failed").with_recoverable(true)
}

#[derive(Default)]
struct FakeProgressReporter {
    reports: Mutex<Vec<PlaybackProgressUpdate>>,
    reports_changed: Condvar,
}

impl PlaybackProgressReporter for FakeProgressReporter {
    fn report_progress(&self, progress: PlaybackProgressUpdate) -> AppResult<()> {
        self.reports.lock().unwrap().push(progress);
        self.reports_changed.notify_all();
        Ok(())
    }
}

impl FakeProgressReporter {
    fn wait_for_reports(&self, expected: usize) {
        let deadline = Instant::now() + Duration::from_secs(2);
        let mut reports = self.reports.lock().unwrap();
        loop {
            if reports.len() >= expected {
                return;
            }
            let now = Instant::now();
            assert!(now < deadline, "timed out waiting for progress reports");
            let timeout = deadline.saturating_duration_since(now);
            reports = self.reports_changed.wait_timeout(reports, timeout).unwrap().0;
        }
    }
}

#[derive(Default)]
struct HangingProgressReporter {
    started: Mutex<bool>,
    started_changed: Condvar,
}

impl HangingProgressReporter {
    fn wait_for_report(&self) {
        let deadline = Instant::now() + Duration::from_secs(2);
        let mut started = self.started.lock().unwrap();
        loop {
            if *started {
                return;
            }
            let now = Instant::now();
            assert!(now < deadline, "timed out waiting for progress report");
            let timeout = deadline.saturating_duration_since(now);
            started = self.started_changed.wait_timeout(started, timeout).unwrap().0;
        }
    }
}

impl PlaybackProgressReporter for HangingProgressReporter {
    fn report_progress(&self, _progress: PlaybackProgressUpdate) -> AppResult<()> {
        *self.started.lock().unwrap() = true;
        self.started_changed.notify_all();
        thread::sleep(Duration::from_secs(30));
        Ok(())
    }
}
