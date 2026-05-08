use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use crate::{
    app::AppState,
    errors::{AppError, AppResult},
    events,
    player::{
        NativePlayerService, PlaybackCommand, PlaybackErrorEvent, PlaybackHost,
        PlaybackPositionEvent, PlaybackProgressReporter, PlayerOpenRequest, PlayerService,
        PlayerSession, ResolvedPlaybackSource,
    },
    providers::{
        emby::{is_container_item_type, is_playable_item_type, EmbyProvider},
        MediaProvider, MediaSource, PlaybackProgressUpdate,
    },
};

use super::auth::emby_provider_for_state;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackCommandRequest {
    pub session_id: String,
    pub command: PlaybackCommand,
}

#[tauri::command]
pub async fn playback_open(
    app: AppHandle,
    state: State<'_, AppState>,
    request: PlayerOpenRequest,
) -> AppResult<PlayerSession> {
    let blocking_state = super::state_for_blocking(state.inner());
    let request_for_resolve = request.clone();
    let target = super::run_blocking_command(move || {
        resolve_playback_target_for_state(&blocking_state, &request_for_resolve)
    })
    .await?;
    let host = Arc::new(TauriPlaybackHost::new(app));
    open_resolved_for_state(state.inner(), host, request, target)
}

#[tauri::command]
pub async fn playback_command(
    app: AppHandle,
    state: State<'_, AppState>,
    request: PlaybackCommandRequest,
) -> AppResult<PlayerSession> {
    let host = Arc::new(TauriPlaybackHost::new(app));
    command_for_state(&state, host, request)
}

pub fn open_for_state(
    state: &AppState,
    host: Arc<dyn PlaybackHost>,
    request: PlayerOpenRequest,
) -> AppResult<PlayerSession> {
    let target = resolve_playback_target_for_state(state, &request)?;
    open_resolved_for_state(state, host, request, target)
}

pub fn open_resolved_for_state(
    state: &AppState,
    host: Arc<dyn PlaybackHost>,
    request: PlayerOpenRequest,
    target: ResolvedPlaybackTarget,
) -> AppResult<PlayerSession> {
    let request = PlayerOpenRequest {
        server_id: request.server_id,
        item_id: target.item_id,
        media_source_id: None,
    };
    player_service_for_state(state, host).open(request, target.source)
}

pub fn command_for_state(
    state: &AppState,
    host: Arc<dyn PlaybackHost>,
    request: PlaybackCommandRequest,
) -> AppResult<PlayerSession> {
    player_service_for_state(state, host).command(&request.session_id, request.command)
}

fn player_service_for_state(state: &AppState, host: Arc<dyn PlaybackHost>) -> NativePlayerService {
    NativePlayerService::with_store_and_progress_reporter(
        state.player_sessions(),
        host,
        state.player_backend(),
        Arc::new(EmbyProgressReporter::new(state)),
    )
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedPlaybackTarget {
    pub item_id: String,
    pub source: ResolvedPlaybackSource,
}

pub fn resolve_playback_target_for_state(
    state: &AppState,
    request: &PlayerOpenRequest,
) -> AppResult<ResolvedPlaybackTarget> {
    resolve_playback_target(&emby_provider_for_state(state), request)
}

fn resolve_playback_target(
    provider: &EmbyProvider,
    request: &PlayerOpenRequest,
) -> AppResult<ResolvedPlaybackTarget> {
    let detail = provider.get_item(&request.server_id, &request.item_id)?;

    if is_playable_item_type(&detail.item.item_type) {
        return Ok(ResolvedPlaybackTarget {
            item_id: detail.item.id,
            source: select_playback_source(
                detail.media_sources,
                request.media_source_id.as_deref(),
            )?,
        });
    }

    if is_container_item_type(&detail.item.item_type) {
        let item = provider
            .first_playable_descendant(&request.server_id, &detail.item.id)?
            .ok_or_else(no_playback_source)?;
        let sources = provider.get_playback_sources(&request.server_id, &item.id)?;

        return Ok(ResolvedPlaybackTarget {
            item_id: item.id,
            source: select_playback_source(sources, None)?,
        });
    }

    Err(no_playback_source())
}

fn select_playback_source(
    sources: Vec<MediaSource>,
    media_source_id: Option<&str>,
) -> AppResult<ResolvedPlaybackSource> {
    if sources.is_empty() {
        return Err(no_playback_source());
    }

    let source = match media_source_id {
        Some(source_id) => sources
            .into_iter()
            .find(|source| source.id == source_id)
            .ok_or_else(|| {
                AppError::new("playback.source_not_found", "Playback source was not found")
                    .with_recoverable(true)
            })?,
        None => sources
            .into_iter()
            .next()
            .expect("sources checked non-empty"),
    };

    Ok(ResolvedPlaybackSource {
        id: source.id,
        url: source.url,
    })
}

fn no_playback_source() -> AppError {
    AppError::new("playback.no_source", "No playback source is available").with_recoverable(true)
}

struct TauriPlaybackHost {
    app: AppHandle,
}

impl TauriPlaybackHost {
    fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

impl PlaybackHost for TauriPlaybackHost {
    fn emit_state_changed(&self, session: &PlayerSession) -> AppResult<()> {
        self.app
            .emit(events::PLAYBACK_STATE_CHANGED, session)
            .map_err(playback_emit_failed)
    }

    fn emit_position(&self, event: &PlaybackPositionEvent) -> AppResult<()> {
        self.app
            .emit(events::PLAYBACK_POSITION, event)
            .map_err(playback_emit_failed)
    }

    fn emit_error(&self, event: &PlaybackErrorEvent) -> AppResult<()> {
        self.app
            .emit(events::PLAYBACK_ERROR, event)
            .map_err(playback_emit_failed)
    }
}

struct EmbyProgressReporter {
    local_state: AppState,
}

impl EmbyProgressReporter {
    fn new(state: &AppState) -> Self {
        Self {
            local_state: super::state_for_blocking(state),
        }
    }
}

impl PlaybackProgressReporter for EmbyProgressReporter {
    fn report_progress(&self, progress: PlaybackProgressUpdate) -> AppResult<()> {
        emby_provider_for_state(&self.local_state).report_progress(progress)
    }
}

fn playback_emit_failed(source: impl ToString) -> AppError {
    AppError::new("playback.event_emit_failed", "Playback event could not be emitted")
        .with_recoverable(true)
        .with_detail(serde_json::json!({ "source": source.to_string() }))
}
