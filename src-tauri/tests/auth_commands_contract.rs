use std::sync::{Arc, Mutex};

use lumi_lib::{
    app::AppState,
    commands::{
        auth as auth_commands, media as media_commands, providers as provider_commands,
        providers::ListLibrariesRequest,
    },
    errors::AppResult,
    persistence::{CredentialKey, Database, LocalStore, MemoryCredentialStore},
    providers::{
        emby::{Clock, EmbyHttpRequest, EmbyHttpResponse, EmbyHttpTransport},
        HomeRowsRequest, ListChildrenRequest, LoginRequest, ProviderKind, ServerLine,
        ServerProfile,
    },
};
use serde_json::{json, Value};

mod commands {
    pub mod auth {
        use super::super::*;

        #[test]
        fn login_manual_persists_server_for_list_servers() {
            let state = test_state(vec![FakeResponse::json(
                200,
                json!({
                    "AccessToken": "token-value",
                    "ServerId": "server-1",
                    "User": {
                        "Id": "user-1",
                        "Name": "Demo User",
                        "ServerName": "Demo Server"
                    }
                }),
            )]);

            let profile = auth_commands::login_manual_for_state(
                &state,
                LoginRequest {
                    base_url: "http://localhost:8096".into(),
                    display_name: None,
                    username: "demo".into(),
                    password: "secret".into(),
                },
            )
            .expect("login via command helper");

            assert!(profile.id.starts_with("emby-profile-"));
            assert_ne!(profile.id, "server-1");
            assert_eq!(profile.lines.len(), 1);
            assert_eq!(profile.lines[0].base_url, "http://localhost:8096");
            assert!(profile.lines[0].is_active);
            assert_eq!(
                provider_commands::list_servers_for_state(&state).expect("list servers"),
                vec![profile]
            );
        }

        #[test]
        fn logout_deletes_server_profile_and_token() {
            let state = test_state(vec![]);
            let profile = seed_profile_with_token(&state);

            auth_commands::logout_for_state(
                &state,
                auth_commands::LogoutRequest {
                    server_id: profile.id.clone(),
                },
            )
            .expect("logout server");

            assert!(provider_commands::list_servers_for_state(&state)
                .expect("list servers")
                .is_empty());
            assert_eq!(
                state
                    .credential_store()
                    .get_token(&CredentialKey::server_token(&profile))
                    .expect("read token"),
                None
            );
        }
    }

    pub mod providers {
        use super::super::*;

        #[test]
        fn list_libraries_uses_saved_server_profile() {
            let state = test_state(vec![FakeResponse::json(
                200,
                json!({
                    "Items": [{
                        "Id": "library-1",
                        "Name": "Movies",
                        "Type": "CollectionFolder",
                        "CollectionType": "movies"
                    }]
                }),
            )]);
            let profile = seed_profile_with_token(&state);

            let libraries = provider_commands::list_libraries_for_state(
                &state,
                ListLibrariesRequest {
                    server_id: profile.id,
                },
            )
            .expect("list libraries via command helper");

            assert_eq!(libraries.len(), 1);
            assert_eq!(libraries[0].title, "Movies");
            assert_eq!(libraries[0].item_type, "folder");
        }

        #[test]
        fn update_server_profile_renames_saved_profile_without_changing_identity() {
            let state = test_state(vec![]);
            let profile = seed_profile_with_token(&state);

            let renamed = provider_commands::update_server_profile_for_state(
                &state,
                provider_commands::UpdateServerProfileRequest {
                    server_id: profile.id.clone(),
                    name: "  Living Room  ".into(),
                },
            )
            .expect("rename server profile");

            assert_eq!(renamed.id, profile.id);
            assert_eq!(renamed.name, "Living Room");
            assert_eq!(renamed.provider_kind, profile.provider_kind);
            assert_eq!(renamed.base_url, profile.base_url);
            assert_eq!(renamed.user_id, profile.user_id);
            assert_eq!(renamed.created_at, profile.created_at);
            assert_eq!(renamed.updated_at, "2026-05-08T00:00:00Z");
            assert_eq!(
                state
                    .credential_store()
                    .get_token(&CredentialKey::server_token(&profile))
                    .expect("token remains readable"),
                Some("token-value".into())
            );
        }

        #[test]
        fn update_server_profile_rejects_blank_name() {
            let state = test_state(vec![]);
            let profile = seed_profile_with_token(&state);

            let error = provider_commands::update_server_profile_for_state(
                &state,
                provider_commands::UpdateServerProfileRequest {
                    server_id: profile.id.clone(),
                    name: "   ".into(),
                },
            )
            .expect_err("blank names are rejected");

            assert_eq!(error.code(), "providers.server_name_required");
            assert!(error.recoverable());
            assert_eq!(
                state
                    .local_store()
                    .get_server_profile(&profile.id)
                    .expect("profile remains saved")
                    .name,
                profile.name
            );
        }

        #[test]
        fn server_line_commands_manage_saved_server_lines() {
            let state = test_state(vec![]);
            let profile = seed_profile_with_token(&state);

            let created = provider_commands::create_server_line_for_state(
                &state,
                provider_commands::CreateServerLineRequest {
                    server_id: profile.id.clone(),
                    name: "  Remote  ".into(),
                    base_url: "https://remote.example.com/emby/".into(),
                },
            )
            .expect("create line");

            assert_eq!(created.base_url, "http://localhost:8096");
            assert_eq!(created.lines.len(), 2);
            let remote = created
                .lines
                .iter()
                .find(|line| line.name == "Remote")
                .expect("remote line")
                .clone();
            assert_eq!(remote.base_url, "https://remote.example.com/emby");
            assert!(!remote.is_active);

            let selected = provider_commands::select_server_line_for_state(
                &state,
                provider_commands::SelectServerLineRequest {
                    server_id: profile.id.clone(),
                    line_id: remote.id.clone(),
                },
            )
            .expect("select line");

            assert_eq!(selected.base_url, "https://remote.example.com/emby");
            assert_eq!(selected.lines.iter().filter(|line| line.is_active).count(), 1);

            let updated = provider_commands::update_server_line_for_state(
                &state,
                provider_commands::UpdateServerLineRequest {
                    server_id: profile.id.clone(),
                    line_id: remote.id.clone(),
                    name: "Remote 2".into(),
                    base_url: "https://remote2.example.com/emby".into(),
                },
            )
            .expect("update line");

            assert_eq!(updated.base_url, "https://remote2.example.com/emby");
            assert!(updated.lines.iter().any(|line| {
                line.id == remote.id
                    && line.name == "Remote 2"
                    && line.base_url == "https://remote2.example.com/emby"
                    && line.is_active
            }));
        }
    }

    pub mod media {
        use super::super::*;

        #[test]
        fn list_children_and_get_item_return_view_ready_media() {
            let state = test_state(vec![
                FakeResponse::json(
                    200,
                    json!({
                        "Items": [{
                            "Id": "movie-1",
                            "Name": "Demo Movie",
                            "Type": "Movie"
                        }],
                        "TotalRecordCount": 1
                    }),
                ),
                FakeResponse::json(
                    200,
                    json!({
                        "Id": "movie-1",
                        "Name": "Demo Movie",
                        "Type": "Movie",
                        "Overview": "A detail payload"
                    }),
                ),
                FakeResponse::json(200, json!({ "MediaSources": [] })),
            ]);
            let profile = seed_profile_with_token(&state);

            let children = media_commands::list_children_for_state(
                &state,
                ListChildrenRequest {
                    server_id: profile.id.clone(),
                    parent_id: None,
                    cursor: None,
                },
            )
            .expect("list children via command helper");
            let detail = media_commands::get_item_for_state(
                &state,
                media_commands::GetItemRequest {
                    server_id: profile.id,
                    item_id: "movie-1".into(),
                },
            )
            .expect("get item via command helper");

            assert_eq!(children.items[0].title, "Demo Movie");
            assert_eq!(detail.item.overview, Some("A detail payload".into()));
            assert!(detail.media_sources.is_empty());
        }

        #[test]
        fn get_home_rows_returns_resume_and_latest_sections() {
            let state = test_state(vec![
                FakeResponse::json(
                    200,
                    json!({
                        "Items": [{
                            "Id": "resume-1",
                            "Name": "Resume Movie",
                            "Type": "Movie",
                            "UserData": {
                                "PlayedPercentage": 25.0,
                                "PlaybackPositionTicks": 9000000000u64
                            }
                        }]
                    }),
                ),
                FakeResponse::json(
                    200,
                    json!([{
                        "Id": "latest-1",
                        "Name": "Latest Movie",
                        "Type": "Movie"
                    }]),
                ),
                FakeResponse::json(
                    200,
                    json!({
                        "Items": [{
                            "Id": "featured-1",
                            "Name": "Random Feature",
                            "Type": "Movie"
                        }],
                        "TotalRecordCount": 1
                    }),
                ),
            ]);
            let profile = seed_profile_with_token(&state);

            let rows = media_commands::get_home_rows_for_state(
                &state,
                HomeRowsRequest {
                    server_id: profile.id,
                    library_ids: vec!["library-1".into()],
                    continue_watching_limit: Some(10),
                    latest_limit: Some(10),
                },
            )
            .expect("get home rows via command helper");

            assert_eq!(rows.continue_watching[0].title, "Resume Movie");
            assert_eq!(
                rows.continue_watching[0].playback_position_seconds,
                Some(900)
            );
            assert_eq!(rows.latest_by_library[0].library_id, "library-1");
            assert_eq!(rows.latest_by_library[0].items[0].title, "Latest Movie");
            assert_eq!(rows.featured_items[0].title, "Random Feature");
        }
    }
}

fn seed_profile_with_token(state: &AppState) -> ServerProfile {
    let profile = ServerProfile {
        id: "server-1".into(),
        provider_kind: ProviderKind::Emby,
        name: "Demo Server".into(),
        base_url: "http://localhost:8096".into(),
        lines: vec![ServerLine {
            id: "line-1".into(),
            server_id: "server-1".into(),
            name: "Primary".into(),
            base_url: "http://localhost:8096".into(),
            is_active: true,
            created_at: "2026-05-07T00:00:00Z".into(),
            updated_at: "2026-05-07T00:00:00Z".into(),
        }],
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

    profile
}

fn test_state(responses: Vec<FakeResponse>) -> AppState {
    let database = Database::open_in_memory().expect("open database");
    database.initialize().expect("initialize database");
    AppState::with_services(
        Arc::new(LocalStore::new(database)),
        Arc::new(MemoryCredentialStore::default()),
        Arc::new(FakeEmbyTransport::new(responses)),
        Arc::new(FixedClock),
    )
}

struct FixedClock;

impl Clock for FixedClock {
    fn now_iso8601(&self) -> String {
        "2026-05-08T00:00:00Z".into()
    }
}

#[derive(Debug, Clone)]
struct FakeResponse {
    status: u16,
    body: Value,
}

impl FakeResponse {
    fn json(status: u16, body: Value) -> Self {
        Self { status, body }
    }
}

#[derive(Default)]
struct FakeEmbyTransport {
    responses: Mutex<Vec<FakeResponse>>,
}

impl FakeEmbyTransport {
    fn new(responses: Vec<FakeResponse>) -> Self {
        Self {
            responses: Mutex::new(responses.into_iter().rev().collect()),
        }
    }
}

impl EmbyHttpTransport for FakeEmbyTransport {
    fn send(&self, _request: EmbyHttpRequest) -> AppResult<EmbyHttpResponse> {
        let response = self.responses.lock().unwrap().pop().expect("fake response");

        Ok(EmbyHttpResponse {
            status: response.status,
            body: response.body,
            headers: Vec::new(),
        })
    }
}
