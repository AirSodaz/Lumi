use std::{collections::HashMap, sync::Arc};

use serde::{Deserialize, Serialize};

use crate::errors::AppResult;

pub mod emby;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ProviderKind {
    Emby,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerProfile {
    pub id: String,
    pub provider_kind: ProviderKind,
    pub name: String,
    pub base_url: String,
    pub user_id: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginRequest {
    pub base_url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    pub username: String,
    pub password: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryItem {
    pub id: String,
    pub provider_kind: ProviderKind,
    pub server_id: String,
    pub item_type: String,
    pub title: String,
    pub sort_title: Option<String>,
    pub poster_url: Option<String>,
    pub backdrop_url: Option<String>,
    pub year: Option<u16>,
    pub runtime_seconds: Option<u32>,
    pub overview: Option<String>,
    pub played_percentage: Option<f64>,
    pub playback_position_seconds: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryItemDetail {
    pub item: LibraryItem,
    pub media_sources: Vec<MediaSource>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListChildrenRequest {
    pub server_id: String,
    pub parent_id: Option<String>,
    pub cursor: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeRowsRequest {
    pub server_id: String,
    pub library_ids: Vec<String>,
    pub continue_watching_limit: Option<usize>,
    pub latest_limit: Option<usize>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeRows {
    pub continue_watching: Vec<LibraryItem>,
    pub latest_by_library: Vec<LatestLibraryItems>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LatestLibraryItems {
    pub library_id: String,
    pub items: Vec<LibraryItem>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PagedResult<T> {
    pub items: Vec<T>,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaSource {
    pub id: String,
    pub name: String,
    pub url: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackProgressUpdate {
    pub server_id: String,
    pub item_id: String,
    pub position_seconds: u32,
    pub is_final: bool,
}

pub trait MediaProvider: Send + Sync {
    fn kind(&self) -> ProviderKind;

    fn login_manual(&self, request: LoginRequest) -> AppResult<ServerProfile>;

    fn list_libraries(&self, server_id: &str) -> AppResult<Vec<LibraryItem>>;

    fn list_children(&self, request: ListChildrenRequest) -> AppResult<PagedResult<LibraryItem>>;

    fn get_item(&self, server_id: &str, item_id: &str) -> AppResult<LibraryItemDetail>;

    fn get_home_rows(&self, request: HomeRowsRequest) -> AppResult<HomeRows>;

    fn get_playback_sources(&self, server_id: &str, item_id: &str) -> AppResult<Vec<MediaSource>>;

    fn report_progress(&self, progress: PlaybackProgressUpdate) -> AppResult<()>;
}

#[derive(Default)]
pub struct ProviderRegistry {
    providers: HashMap<ProviderKind, Arc<dyn MediaProvider>>,
}

impl ProviderRegistry {
    pub fn register(&mut self, provider: Arc<dyn MediaProvider>) {
        self.providers.insert(provider.kind(), provider);
    }

    pub fn get(&self, kind: ProviderKind) -> Option<Arc<dyn MediaProvider>> {
        self.providers.get(&kind).cloned()
    }

    pub fn len(&self) -> usize {
        self.providers.len()
    }

    pub fn is_empty(&self) -> bool {
        self.providers.is_empty()
    }
}
