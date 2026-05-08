use std::sync::{Arc, Mutex};

use lumi_lib::{
    errors::AppResult,
    player::{
        MpvBackend, MpvOpenRequest, NativePlayerService, PlaybackCommand, PlaybackErrorEvent,
        PlaybackHost, PlaybackPositionEvent, PlaybackProgressReporter, PlayerOpenRequest,
        PlayerService, PlayerSession, PlayerState, PlayerWindow, ResolvedPlaybackSource,
    },
    providers::PlaybackProgressUpdate,
};

#[test]
fn native_player_service_opens_window_loads_source_and_emits_state() {
    let host = Arc::new(FakePlaybackHost::default());
    let backend = Arc::new(FakeMpvBackend::default());
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

    assert_eq!(session.state, PlayerState::Playing);
    assert_eq!(session.server_id, "server-1");
    assert_eq!(session.item_id, "movie-1");

    let open = backend.opened.lock().unwrap();
    assert_eq!(open.len(), 1);
    assert_eq!(open[0].session_id, session.id);
    assert_eq!(open[0].window_id, 42);
    assert_eq!(
        open[0].media_url,
        "http://localhost/stream.mkv?api_key=secret"
    );

    let states = host.states.lock().unwrap();
    assert_eq!(
        states.last().expect("state event").state,
        PlayerState::Playing
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
}

impl PlaybackHost for FakePlaybackHost {
    fn create_player_window(&self, session_id: &str) -> AppResult<PlayerWindow> {
        Ok(PlayerWindow {
            label: format!("player-{session_id}"),
            window_id: 42,
        })
    }

    fn emit_state_changed(&self, session: &PlayerSession) -> AppResult<()> {
        self.states.lock().unwrap().push(session.clone());
        Ok(())
    }

    fn emit_position(&self, event: &PlaybackPositionEvent) -> AppResult<()> {
        self.positions.lock().unwrap().push(event.clone());
        Ok(())
    }

    fn emit_error(&self, event: &PlaybackErrorEvent) -> AppResult<()> {
        self.errors.lock().unwrap().push(event.clone());
        Ok(())
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
struct FakeProgressReporter {
    reports: Mutex<Vec<PlaybackProgressUpdate>>,
}

impl PlaybackProgressReporter for FakeProgressReporter {
    fn report_progress(&self, progress: PlaybackProgressUpdate) -> AppResult<()> {
        self.reports.lock().unwrap().push(progress);
        Ok(())
    }
}
