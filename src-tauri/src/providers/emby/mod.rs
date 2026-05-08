use std::{collections::HashSet, sync::Arc, time::Duration};

use reqwest::header::{ACCEPT, USER_AGENT};
use reqwest::Url;
use serde::Deserialize;
use serde_json::{json, Value};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use uuid::Uuid;

use crate::{
    errors::{AppError, AppResult},
    persistence::{CredentialKey, CredentialStore, LocalStore},
    providers::{
        HomeRows, HomeRowsRequest, LatestLibraryItems, LibraryItem, LibraryItemDetail,
        ListChildrenRequest, LoginRequest, MediaProvider, MediaSource, PagedResult,
        PlaybackProgressUpdate, ProviderKind, ServerProfile,
    },
};

const EMBY_CLIENT_NAME: &str = "Lumi";
const EMBY_DEVICE_NAME: &str = "Lumi Desktop";
const EMBY_DEVICE_ID: &str = "lumi-desktop";
const EMBY_CLIENT_VERSION: &str = env!("CARGO_PKG_VERSION");
const EMBY_USER_AGENT: &str = concat!("Lumi/", env!("CARGO_PKG_VERSION"), " (Windows; Tauri)");
const JSON_ACCEPT: &str = "application/json";
const CHILDREN_PAGE_SIZE: usize = 50;
const HOME_CONTINUE_WATCHING_LIMIT: usize = 10;
const HOME_LATEST_LIMIT: usize = 10;
const ITEM_FIELDS: &str = "Overview,SortName,PrimaryImageAspectRatio,MediaSources";
const HOME_ITEM_FIELDS: &str = "Overview,SortName,PrimaryImageAspectRatio";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EmbyHttpMethod {
    Get,
    Post,
}

#[derive(Debug, Clone, PartialEq)]
pub struct EmbyHttpRequest {
    pub method: EmbyHttpMethod,
    pub url: String,
    pub headers: Vec<(String, String)>,
    pub body: Value,
}

impl EmbyHttpRequest {
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(key, _)| key.eq_ignore_ascii_case(name))
            .map(|(_, value)| value.as_str())
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct EmbyHttpResponse {
    pub status: u16,
    pub body: Value,
    pub headers: Vec<(String, String)>,
}

pub trait EmbyHttpTransport: Send + Sync {
    fn send(&self, request: EmbyHttpRequest) -> AppResult<EmbyHttpResponse>;
}

pub trait Clock: Send + Sync {
    fn now_iso8601(&self) -> String;
}

#[derive(Default)]
pub struct SystemClock;

impl Clock for SystemClock {
    fn now_iso8601(&self) -> String {
        OffsetDateTime::now_utc()
            .format(&Rfc3339)
            .unwrap_or_else(|_| "1970-01-01T00:00:00Z".into())
    }
}

pub struct ReqwestEmbyHttpTransport {
    client: reqwest::blocking::Client,
}

impl ReqwestEmbyHttpTransport {
    pub fn new() -> AppResult<Self> {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(20))
            .build()
            .map_err(map_network_error)?;
        Ok(Self { client })
    }
}

impl Default for ReqwestEmbyHttpTransport {
    fn default() -> Self {
        Self::new().expect("create Emby HTTP transport")
    }
}

impl EmbyHttpTransport for ReqwestEmbyHttpTransport {
    fn send(&self, request: EmbyHttpRequest) -> AppResult<EmbyHttpResponse> {
        let method = match request.method {
            EmbyHttpMethod::Get => reqwest::Method::GET,
            EmbyHttpMethod::Post => reqwest::Method::POST,
        };
        let mut builder = self.client.request(method, &request.url);

        for (key, value) in &request.headers {
            builder = builder.header(key, value);
        }

        if !request.body.is_null() {
            builder = builder.json(&request.body);
        }

        let response = builder.send().map_err(map_network_error)?;
        let status = response.status().as_u16();
        let headers = response
            .headers()
            .iter()
            .filter_map(|(key, value)| {
                value
                    .to_str()
                    .ok()
                    .map(|value| (key.as_str().to_string(), value.to_string()))
            })
            .collect();
        let body = response.json::<Value>().unwrap_or(Value::Null);

        Ok(EmbyHttpResponse {
            status,
            body,
            headers,
        })
    }
}

pub struct EmbyProvider {
    local_store: Arc<LocalStore>,
    credential_store: Arc<dyn CredentialStore>,
    transport: Arc<dyn EmbyHttpTransport>,
    clock: Arc<dyn Clock>,
}

impl EmbyProvider {
    pub fn new(
        local_store: Arc<LocalStore>,
        credential_store: Arc<dyn CredentialStore>,
        transport: Arc<dyn EmbyHttpTransport>,
    ) -> Self {
        Self::new_with_clock(
            local_store,
            credential_store,
            transport,
            Arc::new(SystemClock),
        )
    }

    pub fn new_with_clock(
        local_store: Arc<LocalStore>,
        credential_store: Arc<dyn CredentialStore>,
        transport: Arc<dyn EmbyHttpTransport>,
        clock: Arc<dyn Clock>,
    ) -> Self {
        Self {
            local_store,
            credential_store,
            transport,
            clock,
        }
    }

    fn client(&self, base_url: &str) -> AppResult<EmbyClient> {
        EmbyClient::new(base_url, self.transport.clone())
    }

    fn profile_and_token(&self, server_id: &str) -> AppResult<(ServerProfile, String)> {
        let profile = self.local_store.get_server_profile(server_id)?;
        let token = self
            .credential_store
            .get_token(&CredentialKey::server_token(&profile))?
            .ok_or_else(|| {
                AppError::new("emby.auth.missing_token", "Emby token was not found")
                    .with_recoverable(true)
            })?;
        Ok((profile, token))
    }

    pub fn first_playable_descendant(
        &self,
        server_id: &str,
        parent_id: &str,
    ) -> AppResult<Option<LibraryItem>> {
        let (profile, token) = self.profile_and_token(server_id)?;
        let client = self.client(&profile.base_url)?;
        let mut visited = HashSet::new();

        self.first_playable_descendant_with_client(
            &client,
            &profile.id,
            &profile.user_id,
            parent_id,
            &token,
            &mut visited,
        )
    }

    fn first_playable_descendant_with_client(
        &self,
        client: &EmbyClient,
        server_id: &str,
        user_id: &str,
        parent_id: &str,
        token: &str,
        visited: &mut HashSet<String>,
    ) -> AppResult<Option<LibraryItem>> {
        if !visited.insert(parent_id.into()) {
            return Ok(None);
        }

        let mut start_index = 0;
        loop {
            let response = client.list_children(
                user_id,
                Some(parent_id),
                start_index,
                CHILDREN_PAGE_SIZE,
                token,
            )?;
            let total = response.total_record_count.unwrap_or(response.items.len());
            let page_count = response.items.len();

            if page_count == 0 {
                return Ok(None);
            }

            for item in response.items {
                let item = client.map_item(item, server_id)?;
                self.local_store.cache_media_item(&item)?;

                if is_playable_item_type(&item.item_type) {
                    return Ok(Some(item));
                }

                if is_container_item_type(&item.item_type) {
                    if let Some(descendant) = self.first_playable_descendant_with_client(
                        client, server_id, user_id, &item.id, token, visited,
                    )? {
                        return Ok(Some(descendant));
                    }
                }
            }

            start_index += page_count;
            if start_index >= total {
                return Ok(None);
            }
        }
    }
}

impl MediaProvider for EmbyProvider {
    fn kind(&self) -> ProviderKind {
        ProviderKind::Emby
    }

    fn login_manual(&self, request: LoginRequest) -> AppResult<ServerProfile> {
        let client = self.client(&request.base_url)?;
        let authenticated = client.authenticate_by_name(&request.username, &request.password)?;
        let now = self.clock.now_iso8601();
        let profile = ServerProfile {
            id: new_emby_profile_id(),
            provider_kind: ProviderKind::Emby,
            name: authenticated.server_name,
            base_url: client.base_url_string(),
            user_id: authenticated.user_id,
            created_at: now.clone(),
            updated_at: now,
        };

        self.credential_store.set_token(
            &CredentialKey::server_token(&profile),
            &authenticated.access_token,
        )?;
        self.local_store.upsert_server_profile(&profile)?;

        Ok(profile)
    }

    fn list_libraries(&self, server_id: &str) -> AppResult<Vec<LibraryItem>> {
        let (profile, token) = self.profile_and_token(server_id)?;
        let client = self.client(&profile.base_url)?;
        let libraries = client
            .list_libraries(&profile.user_id, &token)?
            .into_iter()
            .map(|item| client.map_item(item, &profile.id))
            .collect::<AppResult<Vec<_>>>()?;

        for item in &libraries {
            self.local_store.cache_media_item(item)?;
        }

        Ok(libraries)
    }

    fn list_children(&self, request: ListChildrenRequest) -> AppResult<PagedResult<LibraryItem>> {
        let (profile, token) = self.profile_and_token(&request.server_id)?;
        let client = self.client(&profile.base_url)?;
        let page_start = request
            .cursor
            .as_deref()
            .and_then(|cursor| cursor.parse::<usize>().ok())
            .unwrap_or(0);
        let response = client.list_children(
            &profile.user_id,
            request.parent_id.as_deref(),
            page_start,
            CHILDREN_PAGE_SIZE,
            &token,
        )?;
        let total = response.total_record_count.unwrap_or(response.items.len());
        let items = response
            .items
            .into_iter()
            .map(|item| client.map_item(item, &profile.id))
            .collect::<AppResult<Vec<_>>>()?;
        let next_start = page_start + items.len();
        let next_cursor = (next_start < total).then(|| next_start.to_string());

        for item in &items {
            self.local_store.cache_media_item(item)?;
        }

        Ok(PagedResult { items, next_cursor })
    }

    fn get_item(&self, server_id: &str, item_id: &str) -> AppResult<LibraryItemDetail> {
        let (profile, token) = self.profile_and_token(server_id)?;
        let client = self.client(&profile.base_url)?;
        let item = client.get_item(&profile.user_id, item_id, &token)?;
        let item = client.map_item(item, &profile.id)?;
        let media_sources = client.get_playback_sources_for_detail(
            &profile.user_id,
            &item.id,
            &item.item_type,
            &token,
        );

        self.local_store.cache_media_item(&item)?;

        Ok(LibraryItemDetail {
            item,
            media_sources,
        })
    }

    fn get_home_rows(&self, request: HomeRowsRequest) -> AppResult<HomeRows> {
        let (profile, token) = self.profile_and_token(&request.server_id)?;
        let client = self.client(&profile.base_url)?;
        let continue_watching_limit = request
            .continue_watching_limit
            .unwrap_or(HOME_CONTINUE_WATCHING_LIMIT);
        let latest_limit = request.latest_limit.unwrap_or(HOME_LATEST_LIMIT);
        let continue_watching = client
            .list_resume_items(&profile.user_id, continue_watching_limit, &token)?
            .into_iter()
            .map(|item| client.map_item(item, &profile.id))
            .collect::<AppResult<Vec<_>>>()?;
        let latest_by_library = request
            .library_ids
            .into_iter()
            .map(|library_id| {
                let items = client
                    .list_latest_items(&profile.user_id, &library_id, latest_limit, &token)?
                    .into_iter()
                    .map(|item| client.map_item(item, &profile.id))
                    .collect::<AppResult<Vec<_>>>()?;

                Ok(LatestLibraryItems { library_id, items })
            })
            .collect::<AppResult<Vec<_>>>()?;

        for item in &continue_watching {
            self.local_store.cache_media_item(item)?;
        }
        for row in &latest_by_library {
            for item in &row.items {
                self.local_store.cache_media_item(item)?;
            }
        }

        Ok(HomeRows {
            continue_watching,
            latest_by_library,
        })
    }

    fn get_playback_sources(&self, server_id: &str, item_id: &str) -> AppResult<Vec<MediaSource>> {
        let (profile, token) = self.profile_and_token(server_id)?;
        let client = self.client(&profile.base_url)?;
        client.get_playback_sources(&profile.user_id, item_id, &token)
    }

    fn report_progress(&self, _progress: PlaybackProgressUpdate) -> AppResult<()> {
        let (profile, token) = self.profile_and_token(&_progress.server_id)?;
        let client = self.client(&profile.base_url)?;
        client.report_progress(_progress, &token)
    }
}

struct EmbyClient {
    base_url: Url,
    transport: Arc<dyn EmbyHttpTransport>,
}

impl EmbyClient {
    fn new(base_url: &str, transport: Arc<dyn EmbyHttpTransport>) -> AppResult<Self> {
        let mut parsed = Url::parse(base_url).map_err(|error| {
            AppError::new("emby.base_url.invalid", "Emby server URL is invalid")
                .with_recoverable(true)
                .with_detail(json!({ "source": error.to_string() }))
        })?;

        match parsed.scheme() {
            "http" | "https" => {}
            scheme => {
                return Err(AppError::new(
                    "emby.base_url.unsupported_scheme",
                    "Emby server URL must use HTTP or HTTPS",
                )
                .with_recoverable(true)
                .with_detail(json!({ "scheme": scheme })));
            }
        }

        parsed.set_query(None);
        parsed.set_fragment(None);
        if parsed.path() != "/" && !parsed.path().ends_with('/') {
            let path = format!("{}/", parsed.path());
            parsed.set_path(&path);
        }
        Ok(Self {
            base_url: parsed,
            transport,
        })
    }

    fn base_url_string(&self) -> String {
        self.base_url.as_str().trim_end_matches('/').to_string()
    }

    fn authenticate_by_name(&self, username: &str, password: &str) -> AppResult<AuthenticatedUser> {
        let body = json!({
            "Username": username,
            "Pw": password,
        });
        let response = self.send(
            EmbyHttpMethod::Post,
            "Users/AuthenticateByName",
            &[],
            vec![("X-Emby-Authorization".into(), emby_authorization_header())],
            body,
        )?;
        self.ensure_success(response, ErrorContext::Authentication)
            .and_then(decode_json::<AuthenticateByNameResponse>)
            .map(|response| AuthenticatedUser {
                access_token: response.access_token,
                user_id: response.user.id,
                server_name: response
                    .user
                    .server_name
                    .or(response.user.name)
                    .unwrap_or_else(|| self.base_url_string()),
            })
    }

    fn list_libraries(&self, user_id: &str, token: &str) -> AppResult<Vec<EmbyItem>> {
        let path = format!("Users/{user_id}/Views");
        let response = self.send(
            EmbyHttpMethod::Get,
            &path,
            &[("IncludeExternalContent", "false".into())],
            token_headers(token),
            Value::Null,
        )?;
        self.ensure_success(response, ErrorContext::Media)
            .and_then(decode_json::<EmbyItemsResponse>)
            .map(|response| response.items)
    }

    fn list_children(
        &self,
        user_id: &str,
        parent_id: Option<&str>,
        start_index: usize,
        limit: usize,
        token: &str,
    ) -> AppResult<EmbyItemsResponse> {
        let path = format!("Users/{user_id}/Items");
        let mut query = vec![
            ("StartIndex", start_index.to_string()),
            ("Limit", limit.to_string()),
            ("Fields", ITEM_FIELDS.into()),
            ("Recursive", "false".into()),
        ];

        if let Some(parent_id) = parent_id {
            query.push(("ParentId", parent_id.into()));
        }

        let response = self.send(
            EmbyHttpMethod::Get,
            &path,
            &query,
            token_headers(token),
            Value::Null,
        )?;
        self.ensure_success(response, ErrorContext::Media)
            .and_then(decode_json::<EmbyItemsResponse>)
    }

    fn list_resume_items(
        &self,
        user_id: &str,
        limit: usize,
        token: &str,
    ) -> AppResult<Vec<EmbyItem>> {
        let path = format!("Users/{user_id}/Items/Resume");
        let response = self.send(
            EmbyHttpMethod::Get,
            &path,
            &[
                ("Limit", limit.to_string()),
                ("Fields", HOME_ITEM_FIELDS.into()),
                ("EnableUserData", "true".into()),
            ],
            token_headers(token),
            Value::Null,
        )?;
        self.ensure_success(response, ErrorContext::Media)
            .and_then(decode_json::<EmbyItemsResponse>)
            .map(|response| response.items)
    }

    fn list_latest_items(
        &self,
        user_id: &str,
        parent_id: &str,
        limit: usize,
        token: &str,
    ) -> AppResult<Vec<EmbyItem>> {
        let path = format!("Users/{user_id}/Items/Latest");
        let response = self.send(
            EmbyHttpMethod::Get,
            &path,
            &[
                ("ParentId", parent_id.into()),
                ("Limit", limit.to_string()),
                ("Fields", HOME_ITEM_FIELDS.into()),
                ("EnableUserData", "true".into()),
            ],
            token_headers(token),
            Value::Null,
        )?;
        self.ensure_success(response, ErrorContext::Media)
            .and_then(decode_json::<Vec<EmbyItem>>)
    }

    fn get_item(&self, user_id: &str, item_id: &str, token: &str) -> AppResult<EmbyItem> {
        let path = format!("Users/{user_id}/Items/{item_id}");
        let response = self.send(
            EmbyHttpMethod::Get,
            &path,
            &[("Fields", ITEM_FIELDS.into())],
            token_headers(token),
            Value::Null,
        )?;
        self.ensure_success(response, ErrorContext::Media)
            .and_then(decode_json::<EmbyItem>)
    }

    fn get_playback_sources(
        &self,
        user_id: &str,
        item_id: &str,
        token: &str,
    ) -> AppResult<Vec<MediaSource>> {
        let path = format!("Items/{item_id}/PlaybackInfo");
        let response = self.send(
            EmbyHttpMethod::Get,
            &path,
            &[("UserId", user_id.into())],
            token_headers(token),
            Value::Null,
        )?;
        let response = self
            .ensure_success(response, ErrorContext::Media)
            .and_then(decode_json::<PlaybackInfoResponse>)?;

        response
            .media_sources
            .into_iter()
            .filter(|source| source.supports_direct_stream.unwrap_or(true))
            .map(|source| self.map_media_source(source, token))
            .collect()
    }

    fn get_playback_sources_for_detail(
        &self,
        user_id: &str,
        item_id: &str,
        item_type: &str,
        token: &str,
    ) -> Vec<MediaSource> {
        if !is_playable_item_type(item_type) {
            return Vec::new();
        }

        self.get_playback_sources(user_id, item_id, token)
            .unwrap_or_default()
    }

    fn report_progress(&self, progress: PlaybackProgressUpdate, token: &str) -> AppResult<()> {
        let path = if progress.is_final {
            "Sessions/Playing/Stopped"
        } else {
            "Sessions/Playing/Progress"
        };
        let body = json!({
            "ItemId": progress.item_id,
            "PositionTicks": seconds_to_runtime_ticks(progress.position_seconds),
            "CanSeek": true,
        });
        let response = self.send(EmbyHttpMethod::Post, path, &[], token_headers(token), body)?;

        self.ensure_success(response, ErrorContext::Media)
            .map(|_| ())
    }

    fn send(
        &self,
        method: EmbyHttpMethod,
        path: &str,
        query: &[(&str, String)],
        headers: Vec<(String, String)>,
        body: Value,
    ) -> AppResult<EmbyHttpResponse> {
        let mut url = self.join_url(path)?;
        if !query.is_empty() {
            let mut pairs = url.query_pairs_mut();
            for (key, value) in query {
                pairs.append_pair(key, value);
            }
        }

        let headers = default_headers(headers);

        self.transport.send(EmbyHttpRequest {
            method,
            url: url.to_string(),
            headers,
            body,
        })
    }

    fn ensure_success(
        &self,
        response: EmbyHttpResponse,
        context: ErrorContext,
    ) -> AppResult<Value> {
        if (200..300).contains(&response.status) {
            return Ok(response.body);
        }

        if is_cloudflare_challenge(&response) {
            return Err(AppError::new(
                "emby.network.cloudflare_challenge",
                "Cloudflare challenge blocked the Emby request",
            )
            .with_recoverable(true)
            .with_detail(json!({ "status": response.status })));
        }

        let code = match (context, response.status) {
            (ErrorContext::Authentication, 401 | 403) => "emby.auth.invalid_credentials",
            (_, 401 | 403) => "emby.auth.unauthorized",
            (_, 404) => "emby.not_found",
            (_, 500..=599) => "emby.server",
            _ => "emby.http",
        };

        let message = match (context, response.status) {
            (ErrorContext::Authentication, 401 | 403) => response
                .body
                .get("Message")
                .and_then(Value::as_str)
                .filter(|message| !message.trim().is_empty())
                .unwrap_or("Invalid username or password"),
            _ => "Emby request failed",
        };

        Err(AppError::new(code, message)
            .with_recoverable(true)
            .with_detail(json!({ "status": response.status, "body": response.body })))
    }

    fn map_item(&self, item: EmbyItem, server_id: &str) -> AppResult<LibraryItem> {
        let title = item.name.unwrap_or_else(|| item.id.clone());
        let poster_tag = item
            .primary_image_tag
            .or(item.image_tags.and_then(|tags| tags.primary));
        let backdrop_tag = item
            .backdrop_image_tags
            .and_then(|tags| tags.into_iter().next());
        let played_percentage = item
            .user_data
            .as_ref()
            .and_then(|user_data| user_data.played_percentage);
        let playback_position_seconds = item
            .user_data
            .and_then(|user_data| user_data.playback_position_ticks)
            .map(runtime_ticks_to_seconds);

        Ok(LibraryItem {
            id: item.id.clone(),
            provider_kind: ProviderKind::Emby,
            server_id: server_id.into(),
            item_type: map_item_type(item.item_type.as_deref(), item.collection_type.as_deref())
                .into(),
            title,
            sort_title: item.sort_name,
            poster_url: poster_tag
                .map(|tag| self.image_url(&item.id, "Primary", &tag))
                .transpose()?,
            backdrop_url: backdrop_tag
                .map(|tag| self.image_url(&item.id, "Backdrop", &tag))
                .transpose()?,
            year: item.production_year,
            runtime_seconds: item.run_time_ticks.map(runtime_ticks_to_seconds),
            overview: item.overview,
            played_percentage,
            playback_position_seconds,
        })
    }

    fn map_media_source(&self, source: EmbyMediaSource, token: &str) -> AppResult<MediaSource> {
        let raw_url = source
            .direct_stream_url
            .or(source.path)
            .ok_or_else(|| AppError::new("emby.media.no_stream_url", "Media source has no URL"))?;

        Ok(MediaSource {
            id: source.id,
            name: source.name.unwrap_or_else(|| "Direct Stream".into()),
            url: self.playback_url(&raw_url, token)?,
        })
    }

    fn image_url(&self, item_id: &str, image_type: &str, tag: &str) -> AppResult<String> {
        let mut url = self.join_url(&format!("Items/{item_id}/Images/{image_type}"))?;
        url.query_pairs_mut().append_pair("tag", tag);
        Ok(url.to_string())
    }

    fn playback_url(&self, raw_url: &str, token: &str) -> AppResult<String> {
        let mut url = if raw_url.starts_with("http://") || raw_url.starts_with("https://") {
            Url::parse(raw_url).map_err(|error| {
                AppError::new(
                    "emby.media.invalid_stream_url",
                    "Media source URL is invalid",
                )
                .with_detail(json!({ "source": error.to_string() }))
            })?
        } else {
            self.join_url(raw_url.trim_start_matches('/'))?
        };

        url.query_pairs_mut().append_pair("api_key", token);
        Ok(url.to_string())
    }

    fn join_url(&self, path: &str) -> AppResult<Url> {
        self.base_url.join(path).map_err(|error| {
            AppError::new("emby.url.join_failed", "Emby URL could not be built")
                .with_detail(json!({ "path": path, "source": error.to_string() }))
        })
    }
}

#[derive(Debug, Clone, Copy)]
enum ErrorContext {
    Authentication,
    Media,
}

#[derive(Debug)]
struct AuthenticatedUser {
    access_token: String,
    user_id: String,
    server_name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct AuthenticateByNameResponse {
    access_token: String,
    user: EmbyUser,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct EmbyUser {
    id: String,
    name: Option<String>,
    server_name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct EmbyItemsResponse {
    #[serde(default)]
    items: Vec<EmbyItem>,
    total_record_count: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct EmbyItem {
    id: String,
    name: Option<String>,
    #[serde(rename = "Type")]
    item_type: Option<String>,
    collection_type: Option<String>,
    sort_name: Option<String>,
    production_year: Option<u16>,
    run_time_ticks: Option<u64>,
    overview: Option<String>,
    image_tags: Option<EmbyImageTags>,
    primary_image_tag: Option<String>,
    backdrop_image_tags: Option<Vec<String>>,
    user_data: Option<EmbyUserData>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct EmbyImageTags {
    primary: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct EmbyUserData {
    played_percentage: Option<f64>,
    playback_position_ticks: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct PlaybackInfoResponse {
    #[serde(default)]
    media_sources: Vec<EmbyMediaSource>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct EmbyMediaSource {
    id: String,
    name: Option<String>,
    direct_stream_url: Option<String>,
    path: Option<String>,
    supports_direct_stream: Option<bool>,
}

fn emby_authorization_header() -> String {
    format!(
        "MediaBrowser Client=\"{EMBY_CLIENT_NAME}\", Device=\"{EMBY_DEVICE_NAME}\", DeviceId=\"{EMBY_DEVICE_ID}\", Version=\"{EMBY_CLIENT_VERSION}\""
    )
}

fn token_headers(token: &str) -> Vec<(String, String)> {
    vec![("X-Emby-Token".into(), token.into())]
}

fn new_emby_profile_id() -> String {
    format!("emby-profile-{}", Uuid::new_v4())
}

fn default_headers(mut headers: Vec<(String, String)>) -> Vec<(String, String)> {
    if !has_header(&headers, USER_AGENT.as_str()) {
        headers.push((USER_AGENT.as_str().into(), EMBY_USER_AGENT.into()));
    }
    if !has_header(&headers, ACCEPT.as_str()) {
        headers.push((ACCEPT.as_str().into(), JSON_ACCEPT.into()));
    }
    headers
}

fn has_header(headers: &[(String, String)], name: &str) -> bool {
    headers
        .iter()
        .any(|(key, _)| key.eq_ignore_ascii_case(name))
}

fn is_cloudflare_challenge(response: &EmbyHttpResponse) -> bool {
    response.headers.iter().any(|(key, value)| {
        key.eq_ignore_ascii_case("cf-mitigated") && value.eq_ignore_ascii_case("challenge")
    })
}

fn decode_json<T: for<'de> Deserialize<'de>>(value: Value) -> AppResult<T> {
    serde_json::from_value(value).map_err(|error| {
        AppError::new("emby.parse", "Emby response could not be parsed")
            .with_detail(json!({ "source": error.to_string() }))
    })
}

fn map_network_error(error: reqwest::Error) -> AppError {
    AppError::new("emby.network", "Emby network request failed")
        .with_recoverable(true)
        .with_detail(json!({ "source": error.to_string() }))
}

fn map_item_type(item_type: Option<&str>, collection_type: Option<&str>) -> &'static str {
    match (item_type, collection_type) {
        (Some("CollectionFolder"), _) | (Some("Folder"), _) => "folder",
        (_, Some("movies")) | (Some("Movie"), _) => "movie",
        (_, Some("tvshows")) | (Some("Series"), _) => "series",
        (Some("Season"), _) => "season",
        (Some("Episode"), _) => "episode",
        (Some("MusicVideo"), _) => "musicVideo",
        (Some("Video"), _) => "video",
        (Some("BoxSet"), _) => "collection",
        _ => "folder",
    }
}

pub fn is_playable_item_type(item_type: &str) -> bool {
    matches!(item_type, "episode" | "movie" | "musicVideo" | "video")
}

pub fn is_container_item_type(item_type: &str) -> bool {
    matches!(item_type, "collection" | "folder" | "season" | "series")
}

fn runtime_ticks_to_seconds(ticks: u64) -> u32 {
    (ticks / 10_000_000).min(u32::MAX as u64) as u32
}

fn seconds_to_runtime_ticks(seconds: u32) -> u64 {
    u64::from(seconds) * 10_000_000
}
