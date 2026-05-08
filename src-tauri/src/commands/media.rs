use tauri::State;

use serde::{Deserialize, Serialize};

use crate::{
    app::AppState,
    errors::AppResult,
    providers::{
        HomeRows, HomeRowsRequest, LibraryItem, LibraryItemDetail, ListChildrenRequest,
        ListFavoritesRequest, MediaProvider, PagedResult,
    },
};

use super::auth::emby_provider_for_state;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetItemRequest {
    pub server_id: String,
    pub item_id: String,
}

#[tauri::command]
pub async fn media_list_children(
    state: State<'_, AppState>,
    request: ListChildrenRequest,
) -> AppResult<PagedResult<LibraryItem>> {
    let state = super::state_for_blocking(state.inner());
    super::run_blocking_command(move || list_children_for_state(&state, request)).await
}

pub fn list_children_for_state(
    state: &AppState,
    request: ListChildrenRequest,
) -> AppResult<PagedResult<LibraryItem>> {
    emby_provider_for_state(state).list_children(request)
}

#[tauri::command]
pub async fn media_list_favorites(
    state: State<'_, AppState>,
    request: ListFavoritesRequest,
) -> AppResult<PagedResult<LibraryItem>> {
    let state = super::state_for_blocking(state.inner());
    super::run_blocking_command(move || list_favorites_for_state(&state, request)).await
}

pub fn list_favorites_for_state(
    state: &AppState,
    request: ListFavoritesRequest,
) -> AppResult<PagedResult<LibraryItem>> {
    emby_provider_for_state(state).list_favorites(request)
}

#[tauri::command]
pub async fn media_get_item(
    state: State<'_, AppState>,
    request: GetItemRequest,
) -> AppResult<LibraryItemDetail> {
    let state = super::state_for_blocking(state.inner());
    super::run_blocking_command(move || get_item_for_state(&state, request)).await
}

pub fn get_item_for_state(
    state: &AppState,
    request: GetItemRequest,
) -> AppResult<LibraryItemDetail> {
    emby_provider_for_state(state).get_item(&request.server_id, &request.item_id)
}

#[tauri::command]
pub async fn media_get_home_rows(
    state: State<'_, AppState>,
    request: HomeRowsRequest,
) -> AppResult<HomeRows> {
    let state = super::state_for_blocking(state.inner());
    super::run_blocking_command(move || get_home_rows_for_state(&state, request)).await
}

pub fn get_home_rows_for_state(state: &AppState, request: HomeRowsRequest) -> AppResult<HomeRows> {
    emby_provider_for_state(state).get_home_rows(request)
}
