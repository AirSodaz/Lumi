use std::sync::{Arc, Mutex};

use lumi_lib::{
    errors::AppResult,
    persistence::{CredentialKey, CredentialStore, Database, LocalStore, MemoryCredentialStore},
    providers::{
        emby::{
            Clock, EmbyHttpMethod, EmbyHttpRequest, EmbyHttpResponse, EmbyHttpTransport,
            EmbyProvider,
        },
        LibraryItem, ListChildrenRequest, LoginRequest, MediaProvider, ProviderKind, ServerProfile,
    },
};
use serde_json::{json, Value};

mod providers {
    pub mod emby {
        use super::super::*;

        #[test]
        fn login_persists_profile_and_token() {
            let local_store = initialized_local_store();
            let credential_store = Arc::new(MemoryCredentialStore::default());
            let transport = Arc::new(FakeEmbyTransport::new(vec![FakeResponse::json(
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
            )]));
            let provider = test_provider(
                local_store.clone(),
                credential_store.clone(),
                transport.clone(),
            );

            let profile = provider
                .login_manual(LoginRequest {
                    base_url: "http://localhost:8096/".into(),
                    username: "demo".into(),
                    password: "secret".into(),
                })
                .expect("login succeeds");

            assert_eq!(
                profile,
                ServerProfile {
                    id: "server-1".into(),
                    provider_kind: ProviderKind::Emby,
                    name: "Demo Server".into(),
                    base_url: "http://localhost:8096".into(),
                    user_id: "user-1".into(),
                    created_at: "2026-05-07T00:00:00Z".into(),
                    updated_at: "2026-05-07T00:00:00Z".into(),
                }
            );
            assert_eq!(
                local_store
                    .get_server_profile("server-1")
                    .expect("profile persisted"),
                profile
            );
            assert_eq!(
                credential_store
                    .get_token(&CredentialKey::server_token(&profile))
                    .expect("token persisted"),
                Some("token-value".into())
            );

            let request = transport.request_at(0);
            assert_eq!(request.method, EmbyHttpMethod::Post);
            assert_eq!(
                request.url,
                "http://localhost:8096/Users/AuthenticateByName"
            );
            assert!(request.header("X-Emby-Authorization").is_some());
            assert_eq!(request.body["Username"], "demo");
            assert_eq!(request.body["Pw"], "secret");
        }

        #[test]
        fn login_allows_empty_password_and_preserves_base_url_path() {
            let local_store = initialized_local_store();
            let credential_store = Arc::new(MemoryCredentialStore::default());
            let transport = Arc::new(FakeEmbyTransport::new(vec![FakeResponse::json(
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
            )]));
            let provider = test_provider(local_store, credential_store, transport.clone());

            let profile = provider
                .login_manual(LoginRequest {
                    base_url: "http://localhost:8096/emby".into(),
                    username: "demo".into(),
                    password: "".into(),
                })
                .expect("login succeeds with empty password");

            assert_eq!(profile.base_url, "http://localhost:8096/emby");

            let request = transport.request_at(0);
            assert_eq!(
                request.url,
                "http://localhost:8096/emby/Users/AuthenticateByName"
            );
            assert_eq!(request.body["Username"], "demo");
            assert_eq!(request.body["Pw"], "");
        }

        #[test]
        fn lists_libraries_and_children_as_view_ready_items() {
            let (local_store, credential_store, profile) = initialized_profile_with_token();
            let transport = Arc::new(FakeEmbyTransport::new(vec![
                FakeResponse::json(
                    200,
                    json!({
                        "Items": [{
                            "Id": "library-1",
                            "Name": "Movies",
                            "Type": "CollectionFolder",
                            "CollectionType": "movies",
                            "PrimaryImageTag": "poster-tag",
                            "BackdropImageTags": ["backdrop-tag"]
                        }]
                    }),
                ),
                FakeResponse::json(
                    200,
                    json!({
                        "Items": [{
                            "Id": "movie-1",
                            "Name": "Demo Movie",
                            "SortName": "Demo Movie",
                            "Type": "Movie",
                            "ProductionYear": 2026,
                            "RunTimeTicks": 72000000000u64,
                            "Overview": "A mapped item",
                            "ImageTags": { "Primary": "movie-poster" },
                            "BackdropImageTags": ["movie-backdrop"]
                        }],
                        "TotalRecordCount": 22
                    }),
                ),
            ]));
            let provider = test_provider(local_store, credential_store, transport.clone());

            let libraries = provider
                .list_libraries(&profile.id)
                .expect("list libraries");
            assert_eq!(
                libraries,
                vec![LibraryItem {
                    id: "library-1".into(),
                    provider_kind: ProviderKind::Emby,
                    server_id: "server-1".into(),
                    item_type: "folder".into(),
                    title: "Movies".into(),
                    sort_title: None,
                    poster_url: Some(
                        "http://localhost:8096/Items/library-1/Images/Primary?tag=poster-tag"
                            .into()
                    ),
                    backdrop_url: Some(
                        "http://localhost:8096/Items/library-1/Images/Backdrop?tag=backdrop-tag"
                            .into()
                    ),
                    year: None,
                    runtime_seconds: None,
                    overview: None,
                }]
            );

            let children = provider
                .list_children(ListChildrenRequest {
                    server_id: profile.id,
                    parent_id: Some("library-1".into()),
                    cursor: Some("21".into()),
                })
                .expect("list children");

            assert_eq!(children.next_cursor, None);
            assert_eq!(children.items[0].id, "movie-1");
            assert_eq!(children.items[0].runtime_seconds, Some(7200));
            assert_eq!(
                children.items[0].poster_url,
                Some("http://localhost:8096/Items/movie-1/Images/Primary?tag=movie-poster".into())
            );

            let children_request = transport.request_at(1);
            assert_eq!(children_request.method, EmbyHttpMethod::Get);
            assert!(children_request
                .url
                .starts_with("http://localhost:8096/Users/user-1/Items?"));
            assert!(children_request.url.contains("ParentId=library-1"));
            assert!(children_request.url.contains("StartIndex=21"));
            assert!(children_request.url.contains("Limit=50"));
            assert_eq!(children_request.header("X-Emby-Token"), Some("token-value"));
        }

        #[test]
        fn get_item_maps_detail_and_playback_sources() {
            let (local_store, credential_store, profile) = initialized_profile_with_token();
            let transport = Arc::new(FakeEmbyTransport::new(vec![
                FakeResponse::json(
                    200,
                    json!({
                        "Id": "movie-1",
                        "Name": "Demo Movie",
                        "SortName": "Demo Movie",
                        "Type": "Movie",
                        "Overview": "A playable item",
                        "MediaSources": []
                    }),
                ),
                FakeResponse::json(
                    200,
                    json!({
                        "MediaSources": [{
                            "Id": "source-1",
                            "Name": "1080p - 20 Mbps",
                            "DirectStreamUrl": "/Videos/movie-1/stream.mkv?MediaSourceId=source-1",
                            "SupportsDirectStream": true
                        }]
                    }),
                ),
            ]));
            let provider = test_provider(local_store, credential_store, transport.clone());

            let detail = provider
                .get_item(&profile.id, "movie-1")
                .expect("get item detail");

            assert_eq!(detail.item.title, "Demo Movie");
            assert_eq!(detail.item.overview, Some("A playable item".into()));
            assert_eq!(detail.media_sources.len(), 1);
            assert_eq!(detail.media_sources[0].id, "source-1");
            assert_eq!(
                detail.media_sources[0].url,
                "http://localhost:8096/Videos/movie-1/stream.mkv?MediaSourceId=source-1&api_key=token-value"
            );

            let detail_request = transport.request_at(0);
            assert_eq!(detail_request.method, EmbyHttpMethod::Get);
            assert!(detail_request
                .url
                .starts_with("http://localhost:8096/Users/user-1/Items/movie-1?"));
            assert!(detail_request.url.contains("Fields="));
            assert_eq!(detail_request.header("X-Emby-Token"), Some("token-value"));
        }

        #[test]
        fn get_series_detail_does_not_request_playback_sources() {
            let (local_store, credential_store, profile) = initialized_profile_with_token();
            let transport = Arc::new(FakeEmbyTransport::new(vec![FakeResponse::json(
                200,
                json!({
                    "Id": "series-1",
                    "Name": "Demo Series",
                    "Type": "Series",
                    "Overview": "A show detail"
                }),
            )]));
            let provider = test_provider(local_store, credential_store, transport.clone());

            let detail = provider
                .get_item(&profile.id, "series-1")
                .expect("get series detail");

            assert_eq!(detail.item.title, "Demo Series");
            assert_eq!(detail.item.item_type, "series");
            assert_eq!(detail.media_sources, vec![]);
            assert_eq!(transport.request_count(), 1);
        }

        #[test]
        fn get_movie_detail_ignores_playback_info_404() {
            let (local_store, credential_store, profile) = initialized_profile_with_token();
            let transport = Arc::new(FakeEmbyTransport::new(vec![
                FakeResponse::json(
                    200,
                    json!({
                        "Id": "movie-1",
                        "Name": "Demo Movie",
                        "Type": "Movie",
                        "Overview": "A detail payload"
                    }),
                ),
                FakeResponse::json(404, json!({ "Message": "Playback info was not found" })),
            ]));
            let provider = test_provider(local_store, credential_store, transport.clone());

            let detail = provider
                .get_item(&profile.id, "movie-1")
                .expect("get movie detail despite playback info failure");

            assert_eq!(detail.item.title, "Demo Movie");
            assert_eq!(detail.item.overview, Some("A detail payload".into()));
            assert_eq!(detail.media_sources, vec![]);
            assert_eq!(transport.request_count(), 2);
            assert!(transport
                .request_at(1)
                .url
                .ends_with("/Items/movie-1/PlaybackInfo?UserId=user-1"));
        }

        #[test]
        fn get_item_detail_404_stays_a_detail_failure() {
            let (local_store, credential_store, profile) = initialized_profile_with_token();
            let transport = Arc::new(FakeEmbyTransport::new(vec![FakeResponse::json(
                404,
                json!({ "Message": "Item was not found" }),
            )]));
            let provider = test_provider(local_store, credential_store, transport);

            let error = provider
                .get_item(&profile.id, "missing-item")
                .expect_err("missing item should fail detail");

            assert_eq!(error.code(), "emby.not_found");
            assert!(error.recoverable());
        }

        #[test]
        fn maps_authentication_failures_to_recoverable_errors() {
            let local_store = initialized_local_store();
            let credential_store = Arc::new(MemoryCredentialStore::default());
            let transport = Arc::new(FakeEmbyTransport::new(vec![FakeResponse::json(
                401,
                json!({ "Message": "Invalid username or password" }),
            )]));
            let provider = test_provider(local_store, credential_store, transport);

            let error = provider
                .login_manual(LoginRequest {
                    base_url: "http://localhost:8096".into(),
                    username: "demo".into(),
                    password: "wrong".into(),
                })
                .expect_err("invalid credentials should fail");

            assert_eq!(error.code(), "emby.auth.invalid_credentials");
            assert_eq!(error.message(), "Invalid username or password");
            assert!(error.recoverable());
        }
    }
}

fn test_provider(
    local_store: Arc<LocalStore>,
    credential_store: Arc<dyn CredentialStore>,
    transport: Arc<dyn EmbyHttpTransport>,
) -> EmbyProvider {
    EmbyProvider::new_with_clock(
        local_store,
        credential_store,
        transport,
        Arc::new(FixedClock),
    )
}

fn initialized_local_store() -> Arc<LocalStore> {
    let database = Database::open_in_memory().expect("open database");
    database.initialize().expect("initialize database");
    Arc::new(LocalStore::new(database))
}

fn initialized_profile_with_token() -> (Arc<LocalStore>, Arc<MemoryCredentialStore>, ServerProfile)
{
    let local_store = initialized_local_store();
    let credential_store = Arc::new(MemoryCredentialStore::default());
    let profile = ServerProfile {
        id: "server-1".into(),
        provider_kind: ProviderKind::Emby,
        name: "Demo Server".into(),
        base_url: "http://localhost:8096".into(),
        user_id: "user-1".into(),
        created_at: "2026-05-07T00:00:00Z".into(),
        updated_at: "2026-05-07T00:00:00Z".into(),
    };

    local_store
        .upsert_server_profile(&profile)
        .expect("persist profile");
    credential_store
        .set_token(&CredentialKey::server_token(&profile), "token-value")
        .expect("persist token");

    (local_store, credential_store, profile)
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
    requests: Mutex<Vec<EmbyHttpRequest>>,
}

impl FakeEmbyTransport {
    fn new(responses: Vec<FakeResponse>) -> Self {
        Self {
            responses: Mutex::new(responses.into_iter().rev().collect()),
            requests: Mutex::new(Vec::new()),
        }
    }

    fn request_at(&self, index: usize) -> EmbyHttpRequest {
        self.requests.lock().unwrap()[index].clone()
    }

    fn request_count(&self) -> usize {
        self.requests.lock().unwrap().len()
    }
}

impl EmbyHttpTransport for FakeEmbyTransport {
    fn send(&self, request: EmbyHttpRequest) -> AppResult<EmbyHttpResponse> {
        self.requests.lock().unwrap().push(request);
        let response = self.responses.lock().unwrap().pop().expect("fake response");

        Ok(EmbyHttpResponse {
            status: response.status,
            body: response.body,
        })
    }
}
