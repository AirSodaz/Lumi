use std::sync::{Arc, Mutex};

use lumi_lib::{
    errors::AppResult,
    player::{
        MpvBackend, MpvOpenRequest, NativePlayerService, PlaybackCommand, PlaybackErrorEvent,
        PlaybackHost, PlaybackPositionEvent, PlayerOpenRequest, PlayerService, PlayerSession,
        PlayerState, PlayerWindow, ResolvedPlaybackSource,
    },
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
        Ok(Some(0))
    }
}
