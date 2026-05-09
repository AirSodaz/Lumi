use std::sync::Arc;

#[cfg(target_os = "windows")]
use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
};

use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use serde::{Deserialize, Serialize};
#[cfg(target_os = "windows")]
use tauri::WindowEvent;
use tauri::{
    window::{Effect, EffectState, EffectsBuilder},
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State, WebviewBuilder, WebviewUrl,
    Window, WindowBuilder,
};

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

use super::auth::{emby_provider_for_deps, emby_provider_for_state};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackCommandRequest {
    pub session_id: String,
    pub command: PlaybackCommand,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackSurfaceBounds {
    pub session_id: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[tauri::command]
pub async fn playback_open(
    app: AppHandle,
    state: State<'_, AppState>,
    request: PlayerOpenRequest,
) -> AppResult<PlayerSession> {
    let deps = super::BlockingProviderDeps::from_state(state.inner());
    let request_for_resolve = request.clone();
    let target = super::run_blocking_command(move || {
        resolve_playback_target(&emby_provider_for_deps(&deps), &request_for_resolve)
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
        create_player_window(&self.app, session_id)
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

    fn show_video_surface(&self, session_id: &str) -> AppResult<()> {
        show_video_surface_for_session(&self.app, session_id)
    }

    fn destroy_video_surface(&self, session_id: &str) -> AppResult<()> {
        destroy_video_surface_for_session(&self.app, session_id)
    }
}

#[tauri::command]
pub fn playback_update_surface_bounds(
    app: AppHandle,
    bounds: PlaybackSurfaceBounds,
) -> AppResult<()> {
    update_surface_bounds_for_session(&app, bounds)
}

fn create_player_window(app: &AppHandle, session_id: &str) -> AppResult<Option<i64>> {
    let label = format!("player-{session_id}");
    let controls_label = player_controls_label(session_id);
    let url = WebviewUrl::App(
        format!("index.html?view=player&surface=controls&sessionId={session_id}").into(),
    );
    let window = if let Some(window) = app.get_window(&label) {
        window
    } else {
        WindowBuilder::new(app, label)
            .title("Lumi Player")
            .inner_size(1120.0, 700.0)
            .min_inner_size(760.0, 460.0)
            .transparent(true)
            .decorations(false)
            .shadow(true)
            .effects(player_window_effects())
            .resizable(true)
            .build()
            .map_err(playback_window_failed)?
    };
    let window_id = embedded_window_id_for(app, &window)?;
    ensure_controls_webview(&window, &controls_label, url)?;

    Ok(window_id)
}

fn ensure_controls_webview(
    window: &Window,
    controls_label: &str,
    url: WebviewUrl,
) -> AppResult<()> {
    let size = window.inner_size().map_err(playback_window_failed)?;
    let bounds = controls_bounds_for_window_size(size.width, size.height);

    if let Some(webview) = window.get_webview(controls_label) {
        webview
            .set_position(PhysicalPosition::new(bounds.x, bounds.y))
            .map_err(playback_window_failed)?;
        webview
            .set_size(PhysicalSize::new(bounds.width, bounds.height))
            .map_err(playback_window_failed)?;
        return Ok(());
    }

    let webview = WebviewBuilder::new(controls_label, url).transparent(true);
    window
        .add_child(
            webview,
            PhysicalPosition::new(bounds.x, bounds.y),
            PhysicalSize::new(bounds.width, bounds.height),
        )
        .map_err(playback_window_failed)?;
    Ok(())
}

fn player_controls_label(session_id: &str) -> String {
    format!("player-controls-{session_id}")
}

#[derive(Debug, Clone, Copy)]
struct ControlsBounds {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

fn controls_bounds_for_window_size(width: u32, height: u32) -> ControlsBounds {
    ControlsBounds {
        x: 0,
        y: 0,
        width: width.max(1),
        height: height.max(1),
    }
}

fn video_bounds_for_window_size(width: u32, height: u32) -> PlaybackSurfaceBounds {
    PlaybackSurfaceBounds {
        session_id: String::new(),
        x: 0,
        y: 0,
        width: width.max(1),
        height: height.max(1),
    }
}

fn player_window_effects() -> tauri::utils::config::WindowEffectsConfig {
    EffectsBuilder::new()
        .effects([
            Effect::Mica,
            Effect::Acrylic,
            Effect::HudWindow,
            Effect::WindowBackground,
        ])
        .state(EffectState::Active)
        .build()
}

#[cfg(target_os = "windows")]
fn embedded_window_id_for(app: &AppHandle, window: &Window) -> AppResult<Option<i64>> {
    let handle = window.window_handle().map_err(playback_window_failed)?;
    match handle.as_raw() {
        RawWindowHandle::Win32(handle) => {
            create_video_host_window_on_main_thread(app, window, handle.hwnd.get() as isize)
        }
        _ => Err(playback_window_failed("unsupported native window handle")),
    }
}

#[cfg(not(target_os = "windows"))]
fn embedded_window_id_for(_app: &AppHandle, _window: &Window) -> AppResult<Option<i64>> {
    Ok(None)
}

#[cfg(target_os = "windows")]
fn create_video_host_window_on_main_thread(
    app: &AppHandle,
    window: &Window,
    parent_hwnd: isize,
) -> AppResult<Option<i64>> {
    let app = app.clone();
    let window = window.clone();
    let (result_tx, result_rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let result = create_video_host_window(&window, parent_hwnd);
        let _ = result_tx.send(result);
    })
    .map_err(playback_window_failed)?;

    result_rx
        .recv()
        .map_err(|error| playback_window_failed(error.to_string()))?
}

#[cfg(target_os = "windows")]
fn create_video_host_window(window: &Window, parent_hwnd: isize) -> AppResult<Option<i64>> {
    use windows_sys::Win32::Foundation::{HINSTANCE, HWND};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, HMENU, WINDOW_EX_STYLE, WS_CHILD, WS_CLIPSIBLINGS, WS_VISIBLE,
    };

    let class_name = wide_null("Static");
    let size = window.inner_size().map_err(playback_window_failed)?;
    let video_bounds = video_bounds_for_window_size(size.width, size.height);
    let child = unsafe {
        CreateWindowExW(
            WINDOW_EX_STYLE::default(),
            class_name.as_ptr(),
            std::ptr::null(),
            WS_CHILD | WS_VISIBLE | WS_CLIPSIBLINGS,
            video_bounds.x,
            video_bounds.y,
            video_bounds.width as i32,
            video_bounds.height as i32,
            parent_hwnd as HWND,
            std::ptr::null_mut::<std::ffi::c_void>() as HMENU,
            std::ptr::null_mut::<std::ffi::c_void>() as HINSTANCE,
            std::ptr::null_mut(),
        )
    };

    if child.is_null() {
        return Err(playback_window_failed(
            "native video host could not be created",
        ));
    }

    let child = child as isize;
    position_video_host(
        child,
        video_bounds.x,
        video_bounds.y,
        video_bounds.width,
        video_bounds.height,
    );
    let session_id = window
        .label()
        .strip_prefix("player-")
        .map(str::to_string)
        .ok_or_else(|| playback_window_failed("player window label is missing session id"))?;
    crate::player::record_playback_diagnostic(format!(
        "surface create session={session_id} child={child}"
    ));
    video_surfaces()
        .lock()
        .map_err(|_| crate::errors::AppError::state_lock_poisoned("video_surfaces"))?
        .insert(
            session_id.clone(),
            VideoSurface {
                child,
                bounds: None,
            },
        );
    let window_for_event = window.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::Resized(size)
        | WindowEvent::ScaleFactorChanged {
            new_inner_size: size,
            ..
        } => {
            let controls_label = player_controls_label(&session_id);
            if let Some(webview) = window_for_event.get_webview(&controls_label) {
                let controls = controls_bounds_for_window_size(size.width, size.height);
                let _ = webview.set_position(PhysicalPosition::new(controls.x, controls.y));
                let _ = webview.set_size(PhysicalSize::new(controls.width, controls.height));
            }
            let mut fallback = video_bounds_for_window_size(size.width, size.height);
            fallback.session_id = session_id.clone();
            let bounds = {
                let reported = video_surfaces().lock().ok().and_then(|surfaces| {
                    surfaces
                        .get(&session_id)
                        .and_then(|surface| surface.bounds.clone())
                });
                reported.unwrap_or(fallback)
            };
            let bounds = PlaybackSurfaceBounds {
                session_id: session_id.clone(),
                width: bounds.width.max(1),
                height: bounds.height.max(1),
                ..bounds
            };
            position_video_host(child, bounds.x, bounds.y, bounds.width, bounds.height);
        }
        _ => {}
    });

    Ok(Some(child as i64))
}

#[cfg(target_os = "windows")]
fn update_surface_bounds_for_session(
    app: &AppHandle,
    bounds: PlaybackSurfaceBounds,
) -> AppResult<()> {
    let app = app.clone();
    app.run_on_main_thread(move || {
        let Ok(mut surfaces) = video_surfaces().lock() else {
            return;
        };
        let Some(surface) = surfaces.get_mut(&bounds.session_id) else {
            return;
        };

        let bounds = PlaybackSurfaceBounds {
            width: bounds.width.max(1),
            height: bounds.height.max(1),
            ..bounds
        };
        surface.bounds = Some(bounds.clone());
        crate::player::record_playback_diagnostic(format!(
            "surface resize session={} x={} y={} width={} height={}",
            bounds.session_id, bounds.x, bounds.y, bounds.width, bounds.height
        ));
        position_video_host(
            surface.child,
            bounds.x,
            bounds.y,
            bounds.width,
            bounds.height,
        );
    })
    .map_err(playback_window_failed)
}

#[cfg(not(target_os = "windows"))]
fn update_surface_bounds_for_session(
    _app: &AppHandle,
    _bounds: PlaybackSurfaceBounds,
) -> AppResult<()> {
    Ok(())
}

#[cfg(target_os = "windows")]
fn show_video_surface_for_session(app: &AppHandle, session_id: &str) -> AppResult<()> {
    use windows_sys::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_SHOWNA};

    let app = app.clone();
    let session_id = session_id.to_string();
    app.run_on_main_thread(move || {
        let Ok(surfaces) = video_surfaces().lock() else {
            return;
        };
        let Some(surface) = surfaces.get(&session_id) else {
            return;
        };

        let _ = unsafe {
            ShowWindow(
                surface.child as windows_sys::Win32::Foundation::HWND,
                SW_SHOWNA,
            )
        };
    })
    .map_err(playback_window_failed)
}

#[cfg(not(target_os = "windows"))]
fn show_video_surface_for_session(_app: &AppHandle, _session_id: &str) -> AppResult<()> {
    Ok(())
}

#[cfg(target_os = "windows")]
fn destroy_video_surface_for_session(app: &AppHandle, session_id: &str) -> AppResult<()> {
    use windows_sys::Win32::UI::WindowsAndMessaging::DestroyWindow;

    let app = app.clone();
    let session_id = session_id.to_string();
    let app_for_task = app.clone();
    app.run_on_main_thread(move || {
        if let Some(webview) = app_for_task.get_webview(&player_controls_label(&session_id)) {
            let _ = webview.close();
        }
        if let Some(window) = app_for_task.get_window(&format!("player-{session_id}")) {
            let _ = window.destroy();
        }
        let Ok(mut surfaces) = video_surfaces().lock() else {
            return;
        };
        let surface = surfaces.remove(&session_id);
        if let Some(surface) = surface {
            crate::player::record_playback_diagnostic(format!(
                "surface destroy session={session_id}"
            ));
            let _ = unsafe { DestroyWindow(surface.child as windows_sys::Win32::Foundation::HWND) };
        }
    })
    .map_err(playback_window_failed)
}

#[cfg(not(target_os = "windows"))]
fn destroy_video_surface_for_session(_app: &AppHandle, _session_id: &str) -> AppResult<()> {
    Ok(())
}

#[cfg(target_os = "windows")]
#[derive(Debug, Clone)]
struct VideoSurface {
    child: isize,
    bounds: Option<PlaybackSurfaceBounds>,
}

#[cfg(target_os = "windows")]
fn video_surfaces() -> &'static Mutex<HashMap<String, VideoSurface>> {
    static VIDEO_SURFACES: OnceLock<Mutex<HashMap<String, VideoSurface>>> = OnceLock::new();
    VIDEO_SURFACES.get_or_init(|| Mutex::new(HashMap::new()))
}

#[cfg(target_os = "windows")]
fn position_video_host(child: isize, x: i32, y: i32, width: u32, height: u32) {
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::WindowsAndMessaging::{SetWindowPos, SWP_NOACTIVATE, SWP_NOZORDER};

    let _ = unsafe {
        SetWindowPos(
            child as HWND,
            std::ptr::null_mut(),
            x,
            y,
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
    deps: super::BlockingProviderDeps,
}

impl EmbyProgressReporter {
    fn new(state: &AppState) -> Self {
        Self {
            deps: super::BlockingProviderDeps::from_state(state),
        }
    }
}

impl PlaybackProgressReporter for EmbyProgressReporter {
    fn report_progress(&self, progress: PlaybackProgressUpdate) -> AppResult<()> {
        emby_provider_for_deps(&self.deps).report_progress(progress)
    }
}

fn playback_emit_failed(source: impl ToString) -> AppError {
    AppError::new(
        "playback.event_emit_failed",
        "Playback event could not be emitted",
    )
    .with_recoverable(true)
    .with_detail(serde_json::json!({ "source": source.to_string() }))
}

fn playback_window_failed(source: impl ToString) -> AppError {
    crate::player::playback_window_failed(source)
}
