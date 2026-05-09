use std::sync::Arc;

use lumi_lib::{
    app::{AppSettings, AppState},
    commands,
    errors::AppResult,
    events,
    persistence::{CredentialKey, Database, LocalStore, MemoryCredentialStore},
    player::ResolvedPlaybackSource,
    player::{PlaybackCommand, PlayerOpenRequest, PlayerService, PlayerSession, PlayerState},
    providers::{
        emby::{Clock, EmbyHttpRequest, EmbyHttpResponse, EmbyHttpTransport},
        HomeRows, HomeRowsRequest, LibraryItem, LibraryItemDetail, ListChildrenRequest,
        ListFavoritesRequest, LoginRequest, MediaProvider, MediaSource, PagedResult,
        PlaybackProgressUpdate, ProviderKind, ProviderRegistry, ServerProfile,
    },
};
use serde_json::json;

#[test]
fn app_state_starts_with_empty_provider_registry_and_default_settings() {
    let state = AppState::default();

    assert_eq!(state.provider_registry().len(), 0);
    assert_eq!(state.settings(), AppSettings::default());
}

#[test]
fn provider_registry_accepts_media_provider_trait_objects() {
    let mut registry = ProviderRegistry::default();

    registry.register(Arc::new(MockProvider));

    assert_eq!(registry.len(), 1);
    assert!(registry.get(ProviderKind::Emby).is_some());
}

#[test]
fn media_provider_trait_exposes_v1_capabilities() {
    let provider = MockProvider;

    assert_eq!(provider.kind(), ProviderKind::Emby);
    assert_eq!(
        provider
            .login_manual(LoginRequest {
                base_url: "http://localhost:8096".into(),
                display_name: None,
                username: "demo".into(),
                password: "secret".into(),
            })
            .expect("login response")
            .provider_kind,
        ProviderKind::Emby
    );
    assert!(provider
        .list_libraries("server-1")
        .expect("libraries")
        .is_empty());
    assert!(provider
        .list_children(ListChildrenRequest {
            server_id: "server-1".into(),
            parent_id: None,
            cursor: None,
        })
        .expect("children")
        .items
        .is_empty());
    assert_eq!(
        provider
            .get_item("server-1", "item-1")
            .expect("item")
            .item
            .title,
        "Demo"
    );
    assert!(provider
        .get_home_rows(HomeRowsRequest {
            server_id: "server-1".into(),
            library_ids: vec!["library-1".into()],
            continue_watching_limit: Some(10),
            latest_limit: Some(10),
        })
        .expect("home rows")
        .latest_by_library
        .is_empty());
    assert!(provider
        .list_favorites(ListFavoritesRequest {
            server_id: "server-1".into(),
            cursor: None,
        })
        .expect("favorites")
        .items
        .is_empty());
    assert!(provider
        .get_playback_sources("server-1", "item-1")
        .expect("sources")
        .is_empty());
    provider
        .report_progress(PlaybackProgressUpdate {
            server_id: "server-1".into(),
            item_id: "item-1".into(),
            position_seconds: 42,
            is_final: false,
        })
        .expect("progress report");
}

#[test]
fn player_service_trait_exposes_session_lifecycle() {
    let player = MockPlayerService;

    let session = player
        .open(
            PlayerOpenRequest {
                server_id: "server-1".into(),
                item_id: "item-1".into(),
                media_source_id: None,
            },
            ResolvedPlaybackSource {
                id: "source-1".into(),
                url: "http://localhost/stream.mkv".into(),
            },
        )
        .expect("open player");

    assert_eq!(session.state, PlayerState::Opening);
    assert_eq!(
        player
            .command(&session.id, PlaybackCommand::Pause)
            .expect("pause")
            .state,
        PlayerState::Paused
    );
    assert_eq!(
        player.close(&session.id).expect("close").state,
        PlayerState::Closed
    );
}

#[test]
fn command_helpers_return_app_results_with_empty_defaults() {
    let state = AppState::default();

    let servers: AppResult<Vec<ServerProfile>> =
        commands::providers::list_servers_for_state(&state);
    let settings: AppResult<AppSettings> = commands::settings::get_settings_for_state(&state);
    let updated: AppResult<AppSettings> =
        commands::settings::update_settings_for_state(&state, Default::default());

    assert!(servers.expect("servers").is_empty());
    assert_eq!(settings.expect("settings"), AppSettings::default());
    assert_eq!(updated.expect("updated settings"), AppSettings::default());
}

#[test]
fn media_command_helper_lists_favorites_from_state() {
    let database = Database::open_in_memory().expect("open database");
    database.initialize().expect("initialize database");
    let state = AppState::with_services(
        Arc::new(LocalStore::new(database)),
        Arc::new(MemoryCredentialStore::default()),
        Arc::new(FakeEmbyTransport),
        Arc::new(FixedClock),
    );
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

    let favorites = commands::media::list_favorites_for_state(
        &state,
        ListFavoritesRequest {
            server_id: "server-1".into(),
            cursor: None,
        },
    )
    .expect("favorites command returns result");

    assert!(favorites.items.is_empty());
    assert_eq!(favorites.next_cursor, None);
}

struct FakeEmbyTransport;

impl EmbyHttpTransport for FakeEmbyTransport {
    fn send(&self, _request: EmbyHttpRequest) -> AppResult<EmbyHttpResponse> {
        Ok(EmbyHttpResponse {
            status: 200,
            body: json!({
                "Items": [],
                "TotalRecordCount": 0
            }),
            headers: Vec::new(),
        })
    }
}

struct FixedClock;

impl Clock for FixedClock {
    fn now_iso8601(&self) -> String {
        "2026-05-07T00:00:00Z".into()
    }
}

#[test]
fn playback_event_names_are_stable() {
    assert_eq!(events::PLAYBACK_STATE_CHANGED, "playback:state-changed");
    assert_eq!(events::PLAYBACK_POSITION, "playback:position");
    assert_eq!(events::PLAYBACK_ERROR, "playback:error");
}

struct MockProvider;

impl MediaProvider for MockProvider {
    fn kind(&self) -> ProviderKind {
        ProviderKind::Emby
    }

    fn login_manual(&self, _request: LoginRequest) -> AppResult<ServerProfile> {
        Ok(ServerProfile {
            id: "server-1".into(),
            provider_kind: ProviderKind::Emby,
            name: "Demo Server".into(),
            base_url: "http://localhost:8096".into(),
            user_id: "user-1".into(),
            created_at: "2026-05-07T00:00:00Z".into(),
            updated_at: "2026-05-07T00:00:00Z".into(),
        })
    }

    fn list_libraries(&self, _server_id: &str) -> AppResult<Vec<LibraryItem>> {
        Ok(Vec::new())
    }

    fn list_children(&self, _request: ListChildrenRequest) -> AppResult<PagedResult<LibraryItem>> {
        Ok(PagedResult {
            items: Vec::new(),
            next_cursor: None,
        })
    }

    fn get_item(&self, server_id: &str, item_id: &str) -> AppResult<LibraryItemDetail> {
        Ok(LibraryItemDetail {
            item: LibraryItem {
                id: item_id.into(),
                provider_kind: ProviderKind::Emby,
                server_id: server_id.into(),
                item_type: "movie".into(),
                title: "Demo".into(),
                sort_title: None,
                poster_url: None,
                backdrop_url: None,
                year: None,
                runtime_seconds: None,
                overview: None,
                played_percentage: None,
                playback_position_seconds: None,
            },
            media_sources: Vec::new(),
        })
    }

    fn get_home_rows(&self, _request: HomeRowsRequest) -> AppResult<HomeRows> {
        Ok(HomeRows {
            continue_watching: Vec::new(),
            latest_by_library: Vec::new(),
            featured_items: Vec::new(),
        })
    }

    fn list_favorites(
        &self,
        _request: ListFavoritesRequest,
    ) -> AppResult<PagedResult<LibraryItem>> {
        Ok(PagedResult {
            items: Vec::new(),
            next_cursor: None,
        })
    }

    fn get_playback_sources(
        &self,
        _server_id: &str,
        _item_id: &str,
    ) -> AppResult<Vec<MediaSource>> {
        Ok(Vec::new())
    }

    fn report_progress(&self, _progress: PlaybackProgressUpdate) -> AppResult<()> {
        Ok(())
    }
}

struct MockPlayerService;

impl PlayerService for MockPlayerService {
    fn open(
        &self,
        request: PlayerOpenRequest,
        _source: ResolvedPlaybackSource,
    ) -> AppResult<PlayerSession> {
        Ok(PlayerSession {
            id: "session-1".into(),
            server_id: request.server_id,
            item_id: request.item_id,
            state: PlayerState::Opening,
            position_seconds: 0,
        })
    }

    fn command(&self, session_id: &str, command: PlaybackCommand) -> AppResult<PlayerSession> {
        let state = match command {
            PlaybackCommand::Pause => PlayerState::Paused,
            _ => PlayerState::Playing,
        };

        Ok(PlayerSession {
            id: session_id.into(),
            server_id: "server-1".into(),
            item_id: "item-1".into(),
            state,
            position_seconds: 0,
        })
    }

    fn session(&self, session_id: &str) -> AppResult<PlayerSession> {
        Ok(PlayerSession {
            id: session_id.into(),
            server_id: "server-1".into(),
            item_id: "item-1".into(),
            state: PlayerState::Opening,
            position_seconds: 0,
        })
    }

    fn close(&self, session_id: &str) -> AppResult<PlayerSession> {
        Ok(PlayerSession {
            id: session_id.into(),
            server_id: "server-1".into(),
            item_id: "item-1".into(),
            state: PlayerState::Closed,
            position_seconds: 0,
        })
    }
}
