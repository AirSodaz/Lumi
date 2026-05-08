use std::sync::{Arc, Mutex};

use lumi_lib::{
    errors::AppResult,
    persistence::{CredentialKey, CredentialStore, Database, LocalStore, MemoryCredentialStore},
    providers::{
        emby::{
            Clock, EmbyHttpMethod, EmbyHttpRequest, EmbyHttpResponse, EmbyHttpTransport,
            EmbyProvider,
        },
        HomeRowsRequest, LibraryItem, ListChildrenRequest, LoginRequest, MediaProvider,
        PlaybackProgressUpdate, ProviderKind, ServerProfile,
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
            let transport = Arc::new(FakeEmbyTransport::new(vec![auth_response(
                "token-value",
                "server-1",
                "user-1",
            )]));
            let provider = test_provider(
                local_store.clone(),
                credential_store.clone(),
                transport.clone(),
            );

            let profile = provider
                .login_manual(LoginRequest {
                    base_url: "http://localhost:8096/".into(),
                    display_name: None,
                    username: "demo".into(),
                    password: "secret".into(),
                })
                .expect("login succeeds");

            assert!(profile.id.starts_with("emby-profile-"));
            assert_ne!(profile.id, "server-1");
            assert_eq!(profile.provider_kind, ProviderKind::Emby);
            assert_eq!(profile.name, "Demo Server");
            assert_eq!(profile.base_url, "http://localhost:8096");
            assert_eq!(profile.user_id, "user-1");
            assert_eq!(profile.created_at, "2026-05-07T00:00:00Z");
            assert_eq!(profile.updated_at, "2026-05-07T00:00:00Z");
            assert_eq!(
                local_store
                    .get_server_profile(&profile.id)
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
            assert_eq!(
                request.header("User-Agent"),
                Some("Lumi/0.1.0 (Windows; Tauri)")
            );
            assert_eq!(request.header("Accept"), Some("application/json"));
            assert!(request.header("X-Emby-Authorization").is_some());
            assert_eq!(request.body["Username"], "demo");
            assert_eq!(request.body["Pw"], "secret");
        }

        #[test]
        fn login_allows_empty_password_and_preserves_base_url_path() {
            let local_store = initialized_local_store();
            let credential_store = Arc::new(MemoryCredentialStore::default());
            let transport = Arc::new(FakeEmbyTransport::new(vec![auth_response(
                "token-value",
                "server-1",
                "user-1",
            )]));
            let provider = test_provider(local_store, credential_store, transport.clone());

            let profile = provider
                .login_manual(LoginRequest {
                    base_url: "http://localhost:8096/emby".into(),
                    display_name: None,
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
        fn repeated_logins_to_same_emby_server_create_distinct_profiles() {
            let local_store = initialized_local_store();
            let credential_store = Arc::new(MemoryCredentialStore::default());
            let transport = Arc::new(FakeEmbyTransport::new(vec![
                auth_response("token-one", "server-1", "user-1"),
                auth_response("token-two", "server-1", "user-1"),
            ]));
            let provider = test_provider(local_store.clone(), credential_store.clone(), transport);

            let first = provider
                .login_manual(LoginRequest {
                    base_url: "http://localhost:8096".into(),
                    display_name: None,
                    username: "demo".into(),
                    password: "secret".into(),
                })
                .expect("first login succeeds");
            let second = provider
                .login_manual(LoginRequest {
                    base_url: "http://localhost:8096".into(),
                    display_name: None,
                    username: "demo".into(),
                    password: "secret".into(),
                })
                .expect("second login succeeds");

            assert_ne!(first.id, second.id);
            assert!(first.id.starts_with("emby-profile-"));
            assert!(second.id.starts_with("emby-profile-"));

            let saved = local_store
                .list_server_profiles()
                .expect("list saved profiles");
            assert_eq!(saved.len(), 2);
            assert!(saved.iter().any(|profile| profile.id == first.id));
            assert!(saved.iter().any(|profile| profile.id == second.id));
            assert_eq!(
                credential_store
                    .get_token(&CredentialKey::server_token(&first))
                    .expect("first token is readable"),
                Some("token-one".into())
            );
            assert_eq!(
                credential_store
                    .get_token(&CredentialKey::server_token(&second))
                    .expect("second token is readable"),
                Some("token-two".into())
            );
        }

        #[test]
        fn login_uses_local_display_name_when_provided() {
            let local_store = initialized_local_store();
            let credential_store = Arc::new(MemoryCredentialStore::default());
            let transport = Arc::new(FakeEmbyTransport::new(vec![auth_response(
                "token-value",
                "server-1",
                "user-1",
            )]));
            let provider = test_provider(local_store.clone(), credential_store, transport);

            let profile = provider
                .login_manual(LoginRequest {
                    base_url: "http://localhost:8096".into(),
                    display_name: Some("  Living Room  ".into()),
                    username: "demo".into(),
                    password: "secret".into(),
                })
                .expect("login succeeds");

            assert_eq!(profile.name, "Living Room");
            assert_eq!(
                local_store
                    .get_server_profile(&profile.id)
                    .expect("profile persisted")
                    .name,
                "Living Room"
            );
        }

        #[test]
        fn login_uses_server_name_when_display_name_is_blank() {
            let local_store = initialized_local_store();
            let credential_store = Arc::new(MemoryCredentialStore::default());
            let transport = Arc::new(FakeEmbyTransport::new(vec![auth_response(
                "token-value",
                "server-1",
                "user-1",
            )]));
            let provider = test_provider(local_store, credential_store, transport);

            let profile = provider
                .login_manual(LoginRequest {
                    base_url: "http://localhost:8096".into(),
                    display_name: Some("   ".into()),
                    username: "demo".into(),
                    password: "secret".into(),
                })
                .expect("login succeeds");

            assert_eq!(profile.name, "Demo Server");
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
                    played_percentage: None,
                    playback_position_seconds: None,
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
        fn lists_home_rows_from_resume_and_latest_by_library() {
            let (local_store, credential_store, profile) = initialized_profile_with_token();
            let transport = Arc::new(FakeEmbyTransport::new(vec![
                FakeResponse::json(
                    200,
                    json!({
                        "Items": [{
                            "Id": "resume-1",
                            "Name": "Resume Movie",
                            "Type": "Movie",
                            "RunTimeTicks": 72000000000u64,
                            "ImageTags": { "Primary": "resume-poster" },
                            "UserData": {
                                "PlayedPercentage": 42.5,
                                "PlaybackPositionTicks": 18000000000u64
                            }
                        }]
                    }),
                ),
                FakeResponse::json(
                    200,
                    json!([{
                        "Id": "latest-movie-1",
                        "Name": "Latest Movie",
                        "Type": "Movie",
                        "ProductionYear": 2026
                    }]),
                ),
                FakeResponse::json(
                    200,
                    json!([{
                        "Id": "latest-episode-1",
                        "Name": "Latest Episode",
                        "Type": "Episode",
                        "RunTimeTicks": 18000000000u64
                    }]),
                ),
            ]));
            let provider = test_provider(local_store, credential_store, transport.clone());

            let rows = provider
                .get_home_rows(HomeRowsRequest {
                    server_id: profile.id,
                    library_ids: vec!["library-1".into(), "library-2".into()],
                    continue_watching_limit: Some(10),
                    latest_limit: Some(10),
                })
                .expect("home rows");

            assert_eq!(rows.continue_watching.len(), 1);
            assert_eq!(rows.continue_watching[0].title, "Resume Movie");
            assert_eq!(rows.continue_watching[0].played_percentage, Some(42.5));
            assert_eq!(
                rows.continue_watching[0].playback_position_seconds,
                Some(1800)
            );
            assert_eq!(rows.latest_by_library.len(), 2);
            assert_eq!(rows.latest_by_library[0].library_id, "library-1");
            assert_eq!(rows.latest_by_library[0].items[0].title, "Latest Movie");
            assert_eq!(rows.latest_by_library[1].library_id, "library-2");
            assert_eq!(rows.latest_by_library[1].items[0].title, "Latest Episode");

            let resume_request = transport.request_at(0);
            assert_eq!(resume_request.method, EmbyHttpMethod::Get);
            assert!(resume_request
                .url
                .starts_with("http://localhost:8096/Users/user-1/Items/Resume?"));
            assert!(resume_request.url.contains("Limit=10"));
            assert!(resume_request.url.contains("EnableUserData=true"));

            let first_latest_request = transport.request_at(1);
            assert!(first_latest_request
                .url
                .starts_with("http://localhost:8096/Users/user-1/Items/Latest?"));
            assert!(first_latest_request.url.contains("ParentId=library-1"));
            assert!(first_latest_request.url.contains("Limit=10"));

            let second_latest_request = transport.request_at(2);
            assert!(second_latest_request.url.contains("ParentId=library-2"));
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
        fn get_item_maps_file_protocol_sources_to_emby_static_streams() {
            let (local_store, credential_store, profile) = initialized_profile_with_token();
            let transport = Arc::new(FakeEmbyTransport::new(vec![
                FakeResponse::json(
                    200,
                    json!({
                        "Id": "episode-1",
                        "Name": "Demo Episode",
                        "Type": "Episode",
                        "Overview": "A file-backed episode"
                    }),
                ),
                FakeResponse::json(
                    200,
                    json!({
                        "MediaSources": [{
                            "Id": "mediasource_episode-1",
                            "Name": "720p - 2 Mbps",
                            "Container": "mp4",
                            "Protocol": "File",
                            "Path": "/media/tv/demo/episode-1.mp4",
                            "SupportsDirectPlay": true,
                            "SupportsDirectStream": true,
                            "SupportsTranscoding": true
                        }]
                    }),
                ),
            ]));
            let provider = test_provider(local_store, credential_store, transport);

            let detail = provider
                .get_item(&profile.id, "episode-1")
                .expect("get item detail");

            assert_eq!(detail.media_sources.len(), 1);
            assert_eq!(detail.media_sources[0].id, "mediasource_episode-1");
            assert_eq!(detail.media_sources[0].name, "720p - 2 Mbps");
            assert_eq!(
                detail.media_sources[0].url,
                "http://localhost:8096/Videos/episode-1/stream?static=true&MediaSourceId=mediasource_episode-1&api_key=token-value"
            );
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
        fn maps_video_and_music_video_as_playable_items() {
            let (local_store, credential_store, profile) = initialized_profile_with_token();
            let transport = Arc::new(FakeEmbyTransport::new(vec![FakeResponse::json(
                200,
                json!({
                    "Items": [
                        {
                            "Id": "video-1",
                            "Name": "Home Video",
                            "Type": "Video"
                        },
                        {
                            "Id": "music-video-1",
                            "Name": "Live Clip",
                            "Type": "MusicVideo"
                        }
                    ],
                    "TotalRecordCount": 2
                }),
            )]));
            let provider = test_provider(local_store, credential_store, transport);

            let children = provider
                .list_children(ListChildrenRequest {
                    server_id: profile.id,
                    parent_id: Some("library-1".into()),
                    cursor: None,
                })
                .expect("list children");

            assert_eq!(children.items[0].item_type, "video");
            assert_eq!(children.items[1].item_type, "musicVideo");
        }

        #[test]
        fn report_progress_posts_playing_progress_with_position_ticks() {
            let (local_store, credential_store, profile) = initialized_profile_with_token();
            let transport = Arc::new(FakeEmbyTransport::new(vec![FakeResponse::json(
                204,
                Value::Null,
            )]));
            let provider = test_provider(local_store, credential_store, transport.clone());

            provider
                .report_progress(PlaybackProgressUpdate {
                    server_id: profile.id,
                    item_id: "movie-1".into(),
                    position_seconds: 42,
                    is_final: false,
                })
                .expect("report progress");

            let request = transport.request_at(0);
            assert_eq!(request.method, EmbyHttpMethod::Post);
            assert_eq!(
                request.url,
                "http://localhost:8096/Sessions/Playing/Progress"
            );
            assert_eq!(request.header("X-Emby-Token"), Some("token-value"));
            assert_eq!(request.body["ItemId"], "movie-1");
            assert_eq!(request.body["PositionTicks"], 420000000u64);
            assert_eq!(request.body["CanSeek"], true);
        }

        #[test]
        fn report_progress_posts_stopped_for_final_position() {
            let (local_store, credential_store, profile) = initialized_profile_with_token();
            let transport = Arc::new(FakeEmbyTransport::new(vec![FakeResponse::json(
                204,
                Value::Null,
            )]));
            let provider = test_provider(local_store, credential_store, transport.clone());

            provider
                .report_progress(PlaybackProgressUpdate {
                    server_id: profile.id,
                    item_id: "movie-1".into(),
                    position_seconds: 96,
                    is_final: true,
                })
                .expect("report final progress");

            let request = transport.request_at(0);
            assert_eq!(request.method, EmbyHttpMethod::Post);
            assert_eq!(
                request.url,
                "http://localhost:8096/Sessions/Playing/Stopped"
            );
            assert_eq!(request.body["ItemId"], "movie-1");
            assert_eq!(request.body["PositionTicks"], 960000000u64);
        }

        #[test]
        fn finds_first_playable_descendant_inside_container() {
            let (local_store, credential_store, profile) = initialized_profile_with_token();
            let transport = Arc::new(FakeEmbyTransport::new(vec![
                FakeResponse::json(
                    200,
                    json!({
                        "Items": [
                            {
                                "Id": "series-1",
                                "Name": "Nested Show",
                                "Type": "Series"
                            }
                        ],
                        "TotalRecordCount": 1
                    }),
                ),
                FakeResponse::json(
                    200,
                    json!({
                        "Items": [
                            {
                                "Id": "season-1",
                                "Name": "Season 1",
                                "Type": "Season"
                            }
                        ],
                        "TotalRecordCount": 1
                    }),
                ),
                FakeResponse::json(
                    200,
                    json!({
                        "Items": [
                            {
                                "Id": "episode-1",
                                "Name": "Episode 1",
                                "Type": "Episode"
                            }
                        ],
                        "TotalRecordCount": 1
                    }),
                ),
            ]));
            let provider = test_provider(local_store, credential_store, transport.clone());

            let item = provider
                .first_playable_descendant(&profile.id, "library-1")
                .expect("resolve descendants")
                .expect("playable descendant");

            assert_eq!(item.id, "episode-1");
            assert_eq!(item.item_type, "episode");
            assert!(transport.request_at(0).url.contains("ParentId=library-1"));
            assert!(transport.request_at(1).url.contains("ParentId=series-1"));
            assert!(transport.request_at(2).url.contains("ParentId=season-1"));
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
                    display_name: None,
                    username: "demo".into(),
                    password: "wrong".into(),
                })
                .expect_err("invalid credentials should fail");

            assert_eq!(error.code(), "emby.auth.invalid_credentials");
            assert_eq!(error.message(), "Invalid username or password");
            assert!(error.recoverable());
        }

        #[test]
        fn maps_cloudflare_challenge_to_recoverable_network_error() {
            let local_store = initialized_local_store();
            let credential_store = Arc::new(MemoryCredentialStore::default());
            let transport = Arc::new(FakeEmbyTransport::new(vec![FakeResponse {
                status: 403,
                body: Value::Null,
                headers: vec![("Cf-Mitigated".into(), "challenge".into())],
            }]));
            let provider = test_provider(local_store, credential_store, transport);

            let error = provider
                .login_manual(LoginRequest {
                    base_url: "http://localhost:8096".into(),
                    display_name: None,
                    username: "demo".into(),
                    password: "secret".into(),
                })
                .expect_err("Cloudflare challenge should be mapped explicitly");

            assert_eq!(error.code(), "emby.network.cloudflare_challenge");
            assert_eq!(
                error.message(),
                "Cloudflare challenge blocked the Emby request"
            );
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
    headers: Vec<(String, String)>,
}

impl FakeResponse {
    fn json(status: u16, body: Value) -> Self {
        Self {
            status,
            body,
            headers: Vec::new(),
        }
    }
}

fn auth_response(access_token: &str, server_id: &str, user_id: &str) -> FakeResponse {
    FakeResponse::json(
        200,
        json!({
            "AccessToken": access_token,
            "ServerId": server_id,
            "User": {
                "Id": user_id,
                "Name": "Demo User",
                "ServerName": "Demo Server"
            }
        }),
    )
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
            headers: response.headers,
        })
    }
}
