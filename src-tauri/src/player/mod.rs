use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::errors::{AppError, AppResult};

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
pub struct PlayerWindow {
    pub label: String,
    pub window_id: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MpvOpenRequest {
    pub session_id: String,
    pub window_id: i64,
    pub media_url: String,
}

pub trait PlaybackHost: Send + Sync {
    fn create_player_window(&self, session_id: &str) -> AppResult<PlayerWindow>;

    fn emit_state_changed(&self, session: &PlayerSession) -> AppResult<()>;

    fn emit_position(&self, event: &PlaybackPositionEvent) -> AppResult<()>;

    fn emit_error(&self, event: &PlaybackErrorEvent) -> AppResult<()>;
}

pub trait MpvBackend: Send + Sync {
    fn open(&self, request: MpvOpenRequest) -> AppResult<()>;

    fn command(&self, session_id: &str, command: PlaybackCommand) -> AppResult<()>;

    fn close(&self, session_id: &str) -> AppResult<()>;

    fn position_seconds(&self, session_id: &str) -> AppResult<Option<u32>>;
}

pub trait PlayerService: Send + Sync {
    fn open(
        &self,
        request: PlayerOpenRequest,
        source: ResolvedPlaybackSource,
    ) -> AppResult<PlayerSession>;

    fn command(&self, session_id: &str, command: PlaybackCommand) -> AppResult<PlayerSession>;

    fn close(&self, session_id: &str) -> AppResult<PlayerSession>;
}

#[derive(Default)]
pub struct PlaybackSessionStore {
    next_id: AtomicU64,
    sessions: Mutex<HashMap<String, StoredPlayerSession>>,
}

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
}

#[derive(Debug, Clone)]
struct StoredPlayerSession {
    session: PlayerSession,
}

pub struct NativePlayerService {
    sessions: Arc<PlaybackSessionStore>,
    host: Arc<dyn PlaybackHost>,
    backend: Arc<dyn MpvBackend>,
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
        Self {
            sessions,
            host,
            backend,
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

    fn start_position_poller(&self, session_id: String) {
        let sessions = self.sessions.clone();
        let backend = self.backend.clone();
        let host = self.host.clone();

        thread::spawn(move || {
            while sessions.is_active(&session_id) {
                thread::sleep(Duration::from_secs(1));
                if !sessions.is_active(&session_id) {
                    break;
                }
                let Ok(Some(position_seconds)) = backend.position_seconds(&session_id) else {
                    continue;
                };
                let _ = sessions.update(&session_id, |stored| {
                    stored.session.position_seconds = position_seconds;
                });
                let _ = host.emit_position(&PlaybackPositionEvent {
                    session_id: session_id.clone(),
                    position_seconds,
                });
            }
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
        let player_window = self.create_window_or_emit(&session_id)?;
        let opening = PlayerSession {
            id: session_id.clone(),
            server_id: request.server_id,
            item_id: request.item_id,
            state: PlayerState::Opening,
            position_seconds: 0,
        };

        self.sessions.insert(StoredPlayerSession {
            session: opening.clone(),
        })?;
        self.emit_state(&opening)?;

        if let Err(error) = self.backend.open(MpvOpenRequest {
            session_id: session_id.clone(),
            window_id: player_window.window_id,
            media_url: source.url,
        }) {
            let _ = self.sessions.update(&session_id, |stored| {
                stored.session.state = PlayerState::Error;
            });
            self.emit_error(Some(session_id), &error);
            return Err(error);
        }

        let playing = self.sessions.update(&opening.id, |stored| {
            stored.session.state = PlayerState::Playing;
        })?;
        self.emit_state(&playing)?;
        self.start_position_poller(playing.id.clone());
        Ok(playing)
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

        let session = self.sessions.update(session_id, |stored| {
            apply_command_to_session(&mut stored.session, &command);
        })?;
        self.emit_state(&session)?;

        if let PlaybackCommand::Seek { position_seconds } = command {
            self.host.emit_position(&PlaybackPositionEvent {
                session_id: session_id.into(),
                position_seconds,
            })?;
        }

        Ok(session)
    }

    fn close(&self, session_id: &str) -> AppResult<PlayerSession> {
        self.sessions.get(session_id)?;
        self.backend.close(session_id).inspect_err(|error| {
            self.emit_error(Some(session_id.into()), error);
        })?;
        let session = self.sessions.update(session_id, |stored| {
            stored.session.state = PlayerState::Closed;
        })?;
        self.emit_state(&session)?;
        Ok(session)
    }
}

impl NativePlayerService {
    fn create_window_or_emit(&self, session_id: &str) -> AppResult<PlayerWindow> {
        self.host
            .create_player_window(session_id)
            .inspect_err(|error| {
                self.emit_error(Some(session_id.into()), error);
            })
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
