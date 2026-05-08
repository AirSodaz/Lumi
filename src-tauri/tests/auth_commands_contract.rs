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
        HomeRowsRequest, ListChildrenRequest, LoginRequest, ProviderKind, ServerProfile,
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
                    username: "demo".into(),
                    password: "secret".into(),
                },
            )
            .expect("login via command helper");

            assert_eq!(profile.id, "server-1");
            assert_eq!(
                provider_commands::list_servers_for_state(&state).expect("list servers"),
                vec![profile]
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
        }
    }
}

fn seed_profile_with_token(state: &AppState) -> ServerProfile {
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
        "2026-05-07T00:00:00Z".into()
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
        })
    }
}
