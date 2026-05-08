use std::sync::Arc;

use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};
#[cfg(target_os = "windows")]
use tauri::WindowEvent;

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

#[tauri::command]
pub async fn playback_get_session(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
) -> AppResult<PlayerSession> {
    let host = Arc::new(TauriPlaybackHost::new(app));
    get_session_for_state(&state, host, &session_id)
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

pub fn get_session_for_state(
    state: &AppState,
    host: Arc<dyn PlaybackHost>,
    session_id: &str,
) -> AppResult<PlayerSession> {
    player_service_for_state(state, host).session(session_id)
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
    fn create_player_window(&self, session_id: &str) -> AppResult<Option<i64>> {
        let label = format!("player-{session_id}");
        let url = WebviewUrl::App(format!("index.html?view=player&sessionId={session_id}").into());
        let window = if let Some(window) = self.app.get_webview_window(&label) {
            window
        } else {
            WebviewWindowBuilder::new(&self.app, label, url)
                .title("Lumi Player")
                .inner_size(1120.0, 700.0)
                .min_inner_size(760.0, 460.0)
                .resizable(true)
                .build()
                .map_err(playback_window_failed)?
        };

        embedded_window_id_for(&window)
    }

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

#[cfg(target_os = "windows")]
fn embedded_window_id_for(window: &tauri::WebviewWindow) -> AppResult<Option<i64>> {
    let handle = window.window_handle().map_err(playback_window_failed)?;
    match handle.as_raw() {
        RawWindowHandle::Win32(handle) => create_video_host_window(window, handle.hwnd.get() as isize),
        _ => Err(playback_window_failed("unsupported native window handle")),
    }
}

#[cfg(not(target_os = "windows"))]
fn embedded_window_id_for(_window: &tauri::WebviewWindow) -> AppResult<Option<i64>> {
    Ok(None)
}

#[cfg(target_os = "windows")]
fn create_video_host_window(
    window: &tauri::WebviewWindow,
    parent_hwnd: isize,
) -> AppResult<Option<i64>> {
    use windows_sys::Win32::Foundation::{HINSTANCE, HWND};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, HMENU, WINDOW_EX_STYLE, WS_CHILD, WS_CLIPSIBLINGS, WS_VISIBLE,
    };

    const CONTROL_REGION_HEIGHT: u32 = 172;

    let class_name = wide_null("Static");
    let size = window.inner_size().map_err(playback_window_failed)?;
    let video_width = size.width.max(1);
    let video_height = size.height.saturating_sub(CONTROL_REGION_HEIGHT).max(1);
    let child = unsafe {
        CreateWindowExW(
            WINDOW_EX_STYLE::default(),
            class_name.as_ptr(),
            std::ptr::null(),
            WS_CHILD | WS_VISIBLE | WS_CLIPSIBLINGS,
            0,
            0,
            video_width as i32,
            video_height as i32,
            parent_hwnd as HWND,
            std::ptr::null_mut::<std::ffi::c_void>() as HMENU,
            std::ptr::null_mut::<std::ffi::c_void>() as HINSTANCE,
            std::ptr::null_mut(),
        )
    };

    if child.is_null() {
        return Err(playback_window_failed("native video host could not be created"));
    }

    let child = child as isize;
    position_video_host(child, video_width, video_height);
    window.on_window_event(move |event| match event {
        WindowEvent::Resized(size)
        | WindowEvent::ScaleFactorChanged {
            new_inner_size: size,
            ..
        } => {
            position_video_host(
                child,
                size.width.max(1),
                size.height.saturating_sub(CONTROL_REGION_HEIGHT).max(1),
            );
        }
        _ => {}
    });

    Ok(Some(child as i64))
}

#[cfg(target_os = "windows")]
fn position_video_host(child: isize, width: u32, height: u32) {
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, SWP_NOACTIVATE, SWP_NOZORDER,
    };

    let _ = unsafe {
        SetWindowPos(
            child as HWND,
            std::ptr::null_mut(),
            0,
            0,
            width as i32,
            height as i32,
            SWP_NOACTIVATE | SWP_NOZORDER,
        )
    };
}

#[cfg(target_os = "windows")]
fn wide_null(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
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

fn playback_window_failed(source: impl ToString) -> AppError {
    crate::player::playback_window_failed(source)
}
