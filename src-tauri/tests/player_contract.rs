use std::{
    sync::{mpsc, Arc, Condvar, Mutex},
    thread,
    time::{Duration, Instant},
};

use lumi_lib::{
    errors::{AppError, AppResult},
    player::{
        MpvBackend, MpvOpenRequest, NativePlayerService, PlaybackCommand, PlaybackErrorEvent,
        PlaybackHost, PlaybackPositionEvent, PlaybackProgressReporter, PlayerOpenRequest,
        PlayerService, PlayerSession, PlayerState, ResolvedPlaybackSource,
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

    backend.complete_open(Ok(()));

    assert_eq!(
        host.wait_for_state(PlayerState::Playing).state,
        PlayerState::Playing
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
    backend.wait_for_close_count(2);

    let states = host.states.lock().unwrap();
    assert!(!states.iter().any(|state| state.state == PlayerState::Playing));
    assert_eq!(
        states.last().expect("closed state event").state,
        PlayerState::Closed
    );
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

    let commands = backend.commands.lock().unwrap();
    assert_eq!(
        commands.as_slice(),
        &[
            ("session-1".into(), PlaybackCommand::Pause),
            (
                "session-1".into(),
                PlaybackCommand::Seek {
                    position_seconds: 120,
                },
            ),
            (
                "session-1".into(),
                PlaybackCommand::SetVolume { volume: 40 },
            ),
            ("session-1".into(), PlaybackCommand::Close),
        ]
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

    let reports = reporter.reports.lock().unwrap();
    assert_eq!(
        reports
            .iter()
            .map(|report| (report.position_seconds, report.is_final))
            .collect::<Vec<_>>(),
        vec![(15, false), (46, false), (96, true)]
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

#[derive(Default)]
struct FakePlaybackHost {
    states: Mutex<Vec<PlayerSession>>,
    positions: Mutex<Vec<PlaybackPositionEvent>>,
    errors: Mutex<Vec<PlaybackErrorEvent>>,
    state_changed: Condvar,
    error_changed: Condvar,
}

impl PlaybackHost for FakePlaybackHost {
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
}

impl FakePlaybackHost {
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
            states = self
                .state_changed
                .wait_timeout(states, timeout)
                .unwrap()
                .0;
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
            errors = self
                .error_changed
                .wait_timeout(errors, timeout)
                .unwrap()
                .0;
        }
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
}

impl MpvBackend for FakeMpvBackend {
    fn open(&self, request: MpvOpenRequest) -> AppResult<()> {
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
    fn open(&self, request: MpvOpenRequest) -> AppResult<()> {
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

fn playback_test_error() -> AppError {
    AppError::new("playback.test_open_failed", "Playback backend failed").with_recoverable(true)
}

#[derive(Default)]
struct FakeProgressReporter {
    reports: Mutex<Vec<PlaybackProgressUpdate>>,
}

impl PlaybackProgressReporter for FakeProgressReporter {
    fn report_progress(&self, progress: PlaybackProgressUpdate) -> AppResult<()> {
        self.reports.lock().unwrap().push(progress);
        Ok(())
    }
}
