use std::{
    collections::{HashMap, VecDeque},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex, OnceLock,
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    errors::{AppError, AppResult},
    providers::PlaybackProgressUpdate,
};

mod mpv;

pub use mpv::RuntimeMpvBackend;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerOpenRequest {
    pub server_id: String,
    pub item_id: String,
    pub media_source_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedPlaybackSource {
    pub id: String,
    pub url: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerSession {
    pub id: String,
    pub server_id: String,
    pub item_id: String,
    pub state: PlayerState,
    pub position_seconds: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PlayerState {
    Opening,
    Playing,
    Paused,
    Buffering,
    Ended,
    Error,
    Closed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PlaybackCommand {
    Play,
    Pause,
    Seek { position_seconds: u32 },
    SetVolume { volume: u8 },
    Close,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackPositionEvent {
    pub session_id: String,
    pub position_seconds: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackErrorEvent {
    pub session_id: Option<String>,
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MpvOpenRequest {
    pub session_id: String,
    pub window_id: Option<i64>,
    pub media_url: String,
}

#[derive(Debug, Clone)]
pub enum MpvPlaybackEvent {
    Loaded,
    Ready,
    Ended,
    Error(AppError),
    Shutdown,
}

pub trait PlaybackHost: Send + Sync {
    fn create_player_window(&self, session_id: &str) -> AppResult<Option<i64>>;

    fn emit_state_changed(&self, session: &PlayerSession) -> AppResult<()>;

    fn emit_position(&self, event: &PlaybackPositionEvent) -> AppResult<()>;

    fn emit_error(&self, event: &PlaybackErrorEvent) -> AppResult<()>;

    fn show_video_surface(&self, _session_id: &str) -> AppResult<()> {
        Ok(())
    }

    fn destroy_video_surface(&self, _session_id: &str) -> AppResult<()> {
        Ok(())
    }
}

pub trait PlaybackProgressReporter: Send + Sync {
    fn report_progress(&self, progress: PlaybackProgressUpdate) -> AppResult<()>;
}

#[derive(Default)]
struct NoopPlaybackProgressReporter;

impl PlaybackProgressReporter for NoopPlaybackProgressReporter {
    fn report_progress(&self, _progress: PlaybackProgressUpdate) -> AppResult<()> {
        Ok(())
    }
}

pub trait MpvBackend: Send + Sync {
    fn open(&self, request: MpvOpenRequest, event_sink: Arc<dyn MpvEventSink>) -> AppResult<()>;

    fn command(&self, session_id: &str, command: PlaybackCommand) -> AppResult<()>;

    fn close(&self, session_id: &str) -> AppResult<()>;

    fn position_seconds(&self, session_id: &str) -> AppResult<Option<u32>>;
}

pub trait MpvEventSink: Send + Sync {
    fn on_mpv_event(&self, session_id: &str, event: MpvPlaybackEvent);
}

pub trait PlayerService: Send + Sync {
    fn open(
        &self,
        request: PlayerOpenRequest,
        source: ResolvedPlaybackSource,
    ) -> AppResult<PlayerSession>;

    fn command(&self, session_id: &str, command: PlaybackCommand) -> AppResult<PlayerSession>;

    fn session(&self, session_id: &str) -> AppResult<PlayerSession>;

    fn close(&self, session_id: &str) -> AppResult<PlayerSession>;
}

#[derive(Default)]
pub struct PlaybackSessionStore {
    next_id: AtomicU64,
    sessions: Mutex<HashMap<String, StoredPlayerSession>>,
}

const PROGRESS_REPORT_INTERVAL_SECONDS: u32 = 30;

impl PlaybackSessionStore {
    fn next_session_id(&self) -> String {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed) + 1;
        format!("session-{id}")
    }

    fn insert(&self, session: StoredPlayerSession) -> AppResult<()> {
        self.sessions
            .lock()
            .map_err(|_| AppError::state_lock_poisoned("player_sessions"))?
            .insert(session.session.id.clone(), session);
        Ok(())
    }

    fn get(&self, session_id: &str) -> AppResult<StoredPlayerSession> {
        self.sessions
            .lock()
            .map_err(|_| AppError::state_lock_poisoned("player_sessions"))?
            .get(session_id)
            .cloned()
            .ok_or_else(|| session_not_found(session_id))
    }

    fn update<F>(&self, session_id: &str, update: F) -> AppResult<PlayerSession>
    where
        F: FnOnce(&mut StoredPlayerSession),
    {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| AppError::state_lock_poisoned("player_sessions"))?;
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| session_not_found(session_id))?;
        update(session);
        Ok(session.session.clone())
    }

    fn update_position(
        &self,
        session_id: &str,
        position_seconds: u32,
        report_interval_seconds: u32,
    ) -> AppResult<(PlayerSession, bool)> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| AppError::state_lock_poisoned("player_sessions"))?;
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| session_not_found(session_id))?;

        session.session.position_seconds = position_seconds;
        let should_report = should_report_progress(
            session.last_reported_position_seconds,
            position_seconds,
            report_interval_seconds,
        );

        if should_report {
            session.last_reported_position_seconds = Some(position_seconds);
        }

        Ok((session.session.clone(), should_report))
    }

    fn is_active(&self, session_id: &str) -> bool {
        self.sessions
            .lock()
            .map(|sessions| {
                sessions
                    .get(session_id)
                    .map(|stored| {
                        !matches!(
                            stored.session.state,
                            PlayerState::Closed | PlayerState::Ended | PlayerState::Error
                        )
                    })
                    .unwrap_or(false)
            })
            .unwrap_or(false)
    }

    fn is_closed(&self, session_id: &str) -> bool {
        self.sessions
            .lock()
            .map(|sessions| {
                sessions
                    .get(session_id)
                    .map(|stored| stored.session.state == PlayerState::Closed)
                    .unwrap_or(true)
            })
            .unwrap_or(true)
    }
}

#[derive(Debug, Clone)]
struct StoredPlayerSession {
    session: PlayerSession,
    last_reported_position_seconds: Option<u32>,
}

pub struct NativePlayerService {
    sessions: Arc<PlaybackSessionStore>,
    host: Arc<dyn PlaybackHost>,
    backend: Arc<dyn MpvBackend>,
    progress_reporter: Arc<dyn PlaybackProgressReporter>,
    progress_report_interval_seconds: u32,
}

impl NativePlayerService {
    pub fn new(host: Arc<dyn PlaybackHost>, backend: Arc<dyn MpvBackend>) -> Self {
        Self::with_store(Arc::new(PlaybackSessionStore::default()), host, backend)
    }

    pub fn with_store(
        sessions: Arc<PlaybackSessionStore>,
        host: Arc<dyn PlaybackHost>,
        backend: Arc<dyn MpvBackend>,
    ) -> Self {
        Self::with_store_and_progress_reporter(
            sessions,
            host,
            backend,
            Arc::new(NoopPlaybackProgressReporter),
        )
    }

    pub fn with_progress_reporter(
        host: Arc<dyn PlaybackHost>,
        backend: Arc<dyn MpvBackend>,
        progress_reporter: Arc<dyn PlaybackProgressReporter>,
    ) -> Self {
        Self::with_store_and_progress_reporter(
            Arc::new(PlaybackSessionStore::default()),
            host,
            backend,
            progress_reporter,
        )
    }

    pub fn with_store_and_progress_reporter(
        sessions: Arc<PlaybackSessionStore>,
        host: Arc<dyn PlaybackHost>,
        backend: Arc<dyn MpvBackend>,
        progress_reporter: Arc<dyn PlaybackProgressReporter>,
    ) -> Self {
        Self {
            sessions,
            host,
            backend,
            progress_reporter,
            progress_report_interval_seconds: PROGRESS_REPORT_INTERVAL_SECONDS,
        }
    }

    fn emit_state(&self, session: &PlayerSession) -> AppResult<()> {
        self.host.emit_state_changed(session)
    }

    fn emit_error(&self, session_id: Option<String>, error: &AppError) {
        let _ = self.host.emit_error(&PlaybackErrorEvent {
            session_id,
            code: error.code().into(),
            message: error.message().into(),
        });
    }
}

impl PlayerService for NativePlayerService {
    fn open(
        &self,
        request: PlayerOpenRequest,
        source: ResolvedPlaybackSource,
    ) -> AppResult<PlayerSession> {
        let session_id = self.sessions.next_session_id();
        let window_id = self
            .host
            .create_player_window(&session_id)
            .inspect_err(|error| {
                self.emit_error(Some(session_id.clone()), error);
            })?;
        let opening = PlayerSession {
            id: session_id.clone(),
            server_id: request.server_id,
            item_id: request.item_id,
            state: PlayerState::Opening,
            position_seconds: 0,
        };

        self.sessions.insert(StoredPlayerSession {
            session: opening.clone(),
            last_reported_position_seconds: None,
        })?;
        self.emit_state(&opening)?;

        let sessions = self.sessions.clone();
        let backend = self.backend.clone();
        let host = self.host.clone();
        let progress_reporter = self.progress_reporter.clone();
        let report_interval_seconds = self.progress_report_interval_seconds;
        let session_id_for_open = session_id.clone();
        thread::spawn(move || {
            let event_sink = Arc::new(NativeMpvEventSink {
                sessions: sessions.clone(),
                backend: backend.clone(),
                host: host.clone(),
                progress_reporter: progress_reporter.clone(),
                report_interval_seconds,
            });
            let open_result = backend.open(
                MpvOpenRequest {
                    session_id: session_id_for_open.clone(),
                    window_id,
                    media_url: source.url,
                },
                event_sink,
            );

            match open_result {
                Ok(()) => {
                    if sessions.is_closed(&session_id_for_open) {
                        let _ = backend.close(&session_id_for_open);
                        return;
                    }

                    let buffering = sessions.update(&session_id_for_open, |stored| {
                        if stored.session.state == PlayerState::Opening {
                            stored.session.state = PlayerState::Buffering;
                        }
                    });
                    let Ok(buffering) = buffering else {
                        let _ = backend.close(&session_id_for_open);
                        return;
                    };
                    if buffering.state == PlayerState::Buffering {
                        let _ = host.emit_state_changed(&buffering);
                    }
                }
                Err(error) => {
                    if !sessions.is_closed(&session_id_for_open) {
                        let _ = sessions.update(&session_id_for_open, |stored| {
                            stored.session.state = PlayerState::Error;
                        });
                        let _ = host.destroy_video_surface(&session_id_for_open);
                        let _ = host.emit_error(&PlaybackErrorEvent {
                            session_id: Some(session_id_for_open.clone()),
                            code: error.code().into(),
                            message: error.message().into(),
                        });
                        if let Ok(session) = sessions.get(&session_id_for_open) {
                            let _ = host.emit_state_changed(&session.session);
                        }
                    }
                }
            }
        });

        Ok(opening)
    }

    fn session(&self, session_id: &str) -> AppResult<PlayerSession> {
        self.sessions.get(session_id).map(|stored| stored.session)
    }

    fn command(&self, session_id: &str, command: PlaybackCommand) -> AppResult<PlayerSession> {
        self.sessions.get(session_id)?;

        if matches!(command, PlaybackCommand::Close) {
            return self.close(session_id);
        }

        self.backend
            .command(session_id, command.clone())
            .inspect_err(|error| {
                self.emit_error(Some(session_id.into()), error);
            })?;

        let mut session = self.sessions.update(session_id, |stored| {
            apply_command_to_session(&mut stored.session, &command);
        })?;

        if let PlaybackCommand::Seek { position_seconds } = command {
            let (seeked, should_report) = self.sessions.update_position(
                session_id,
                position_seconds,
                self.progress_report_interval_seconds,
            )?;
            session = seeked;
            self.host.emit_position(&PlaybackPositionEvent {
                session_id: session_id.into(),
                position_seconds,
            })?;
            if should_report {
                let _ = self
                    .progress_reporter
                    .report_progress(progress_from_session(&session, false));
            }
        }

        self.emit_state(&session)?;
        Ok(session)
    }

    fn close(&self, session_id: &str) -> AppResult<PlayerSession> {
        self.sessions.get(session_id)?;
        self.host.destroy_video_surface(session_id)?;
        let session = self.sessions.update(session_id, |stored| {
            stored.session.state = PlayerState::Closed;
        })?;
        self.emit_state(&session)?;
        let _ = self
            .progress_reporter
            .report_progress(progress_from_session(&session, true));
        let backend = self.backend.clone();
        let session_id = session_id.to_string();
        record_playback_diagnostic(format!("close requested session={session_id}"));
        thread::spawn(move || {
            record_playback_diagnostic(format!("mpv close start session={session_id}"));
            if let Err(error) = backend.close(&session_id) {
                record_playback_diagnostic(format!(
                    "mpv close failed session={session_id} code={}",
                    error.code()
                ));
            } else {
                record_playback_diagnostic(format!("mpv close complete session={session_id}"));
            }
        });
        Ok(session)
    }
}

struct NativeMpvEventSink {
    sessions: Arc<PlaybackSessionStore>,
    backend: Arc<dyn MpvBackend>,
    host: Arc<dyn PlaybackHost>,
    progress_reporter: Arc<dyn PlaybackProgressReporter>,
    report_interval_seconds: u32,
}

impl MpvEventSink for NativeMpvEventSink {
    fn on_mpv_event(&self, session_id: &str, event: MpvPlaybackEvent) {
        match event {
            MpvPlaybackEvent::Loaded => self.handle_loaded(session_id),
            MpvPlaybackEvent::Ready => self.handle_ready(session_id),
            MpvPlaybackEvent::Ended | MpvPlaybackEvent::Shutdown => {
                self.handle_terminal_state(session_id, PlayerState::Ended)
            }
            MpvPlaybackEvent::Error(error) => self.handle_error(session_id, error),
        }
    }
}

impl NativeMpvEventSink {
    fn handle_loaded(&self, session_id: &str) {
        if self.sessions.is_closed(session_id) {
            return;
        }

        let Ok(session) = self.sessions.update(session_id, |stored| {
            if stored.session.state == PlayerState::Opening {
                stored.session.state = PlayerState::Buffering;
            }
        }) else {
            return;
        };

        if session.state == PlayerState::Buffering {
            let _ = self.host.emit_state_changed(&session);
        }
    }

    fn handle_ready(&self, session_id: &str) {
        if self.sessions.is_closed(session_id) {
            let _ = self.backend.close(session_id);
            return;
        }
        let Ok(current) = self.sessions.get(session_id) else {
            let _ = self.backend.close(session_id);
            return;
        };
        if matches!(
            current.session.state,
            PlayerState::Playing | PlayerState::Closed | PlayerState::Ended | PlayerState::Error
        ) {
            return;
        }

        let Ok(session) = self.sessions.update(session_id, |stored| {
            if !matches!(
                stored.session.state,
                PlayerState::Playing
                    | PlayerState::Closed
                    | PlayerState::Ended
                    | PlayerState::Error
            ) {
                stored.session.state = PlayerState::Playing;
            }
        }) else {
            let _ = self.backend.close(session_id);
            return;
        };

        if session.state != PlayerState::Playing {
            return;
        }

        let _ = self.host.emit_state_changed(&session);
        start_position_poller(
            self.sessions.clone(),
            self.backend.clone(),
            self.host.clone(),
            self.progress_reporter.clone(),
            session_id.into(),
            self.report_interval_seconds,
        );
    }

    fn handle_error(&self, session_id: &str, error: AppError) {
        if self.sessions.is_closed(session_id) {
            let _ = self.backend.close(session_id);
            return;
        }

        let _ = self.sessions.update(session_id, |stored| {
            stored.session.state = PlayerState::Error;
        });
        let _ = self.host.destroy_video_surface(session_id);
        let _ = self.host.emit_error(&PlaybackErrorEvent {
            session_id: Some(session_id.into()),
            code: error.code().into(),
            message: error.message().into(),
        });
        if let Ok(session) = self.sessions.get(session_id) {
            let _ = self.host.emit_state_changed(&session.session);
        }
    }

    fn handle_terminal_state(&self, session_id: &str, state: PlayerState) {
        if self.sessions.is_closed(session_id) {
            return;
        }

        let Ok(session) = self.sessions.update(session_id, |stored| {
            if !matches!(
                stored.session.state,
                PlayerState::Error | PlayerState::Closed
            ) {
                stored.session.state = state;
            }
        }) else {
            return;
        };
        let _ = self.host.destroy_video_surface(session_id);
        let _ = self.host.emit_state_changed(&session);
    }
}

fn apply_command_to_session(session: &mut PlayerSession, command: &PlaybackCommand) {
    match command {
        PlaybackCommand::Play => session.state = PlayerState::Playing,
        PlaybackCommand::Pause => session.state = PlayerState::Paused,
        PlaybackCommand::Seek { position_seconds } => {
            session.position_seconds = *position_seconds;
        }
        PlaybackCommand::SetVolume { .. } => {}
        PlaybackCommand::Close => session.state = PlayerState::Closed,
    }
}

fn start_position_poller(
    sessions: Arc<PlaybackSessionStore>,
    backend: Arc<dyn MpvBackend>,
    host: Arc<dyn PlaybackHost>,
    progress_reporter: Arc<dyn PlaybackProgressReporter>,
    session_id: String,
    report_interval_seconds: u32,
) {
    thread::spawn(move || {
        while sessions.is_active(&session_id) {
            thread::sleep(Duration::from_secs(1));
            if !sessions.is_active(&session_id) {
                break;
            }
            let Ok(Some(position_seconds)) = backend.position_seconds(&session_id) else {
                continue;
            };
            let Ok((session, should_report)) =
                sessions.update_position(&session_id, position_seconds, report_interval_seconds)
            else {
                continue;
            };
            let _ = host.emit_position(&PlaybackPositionEvent {
                session_id: session_id.clone(),
                position_seconds,
            });
            if should_report {
                let _ = progress_reporter.report_progress(progress_from_session(&session, false));
            }
        }
    });
}

fn progress_from_session(session: &PlayerSession, is_final: bool) -> PlaybackProgressUpdate {
    PlaybackProgressUpdate {
        server_id: session.server_id.clone(),
        item_id: session.item_id.clone(),
        position_seconds: session.position_seconds,
        is_final,
    }
}

fn should_report_progress(
    last_reported_position_seconds: Option<u32>,
    position_seconds: u32,
    report_interval_seconds: u32,
) -> bool {
    if position_seconds == 0 {
        return false;
    }

    match last_reported_position_seconds {
        None => true,
        Some(last) if position_seconds < last => true,
        Some(last) => position_seconds.saturating_sub(last) >= report_interval_seconds,
    }
}

fn session_not_found(session_id: &str) -> AppError {
    AppError::new(
        "playback.session_not_found",
        "Playback session was not found",
    )
    .with_recoverable(true)
    .with_detail(json!({ "sessionId": session_id }))
}

pub fn playback_window_failed(source: impl ToString) -> AppError {
    AppError::new(
        "playback.window_failed",
        "Player window could not be created",
    )
    .with_recoverable(true)
    .with_detail(json!({ "source": source.to_string() }))
}

pub fn playback_command_failed(source: impl ToString) -> AppError {
    AppError::new("playback.command_failed", "Native mpv command failed")
        .with_recoverable(true)
        .with_detail(json!({ "source": source.to_string() }))
}

pub fn playback_library_missing(candidates: Vec<String>, source: impl ToString) -> AppError {
    AppError::new(
        "playback.mpv_library_missing",
        "Native mpv library could not be loaded",
    )
    .with_recoverable(true)
    .with_detail(json!({
        "candidates": candidates,
        "env": "LUMI_LIBMPV_PATH",
        "source": source.to_string(),
    }))
}

pub fn playback_init_failed(source: impl ToString) -> AppError {
    AppError::new(
        "playback.mpv_init_failed",
        "Native mpv could not be initialized",
    )
    .with_recoverable(true)
    .with_detail(json!({ "source": source.to_string() }))
}

pub fn record_playback_diagnostic(message: impl Into<String>) {
    const MAX_DIAGNOSTIC_LINES: usize = 200;

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    let mut line = format!("[{timestamp}] {}", message.into());
    if line.len() > 500 {
        line.truncate(500);
        line.push_str("...");
    }

    let Ok(mut lines) = playback_diagnostics().lock() else {
        return;
    };
    lines.push_back(line);
    while lines.len() > MAX_DIAGNOSTIC_LINES {
        lines.pop_front();
    }
}

pub fn recent_playback_diagnostics() -> Vec<String> {
    playback_diagnostics()
        .lock()
        .map(|lines| lines.iter().cloned().collect())
        .unwrap_or_default()
}

fn playback_diagnostics() -> &'static Mutex<VecDeque<String>> {
    static PLAYBACK_DIAGNOSTICS: OnceLock<Mutex<VecDeque<String>>> = OnceLock::new();
    PLAYBACK_DIAGNOSTICS.get_or_init(|| Mutex::new(VecDeque::new()))
}
