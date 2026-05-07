use tauri::State;

use serde::{Deserialize, Serialize};

use crate::{
    app::AppState,
    errors::AppResult,
    providers::{LibraryItem, LibraryItemDetail, ListChildrenRequest, MediaProvider, PagedResult},
};

use super::auth::emby_provider_for_state;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetItemRequest {
    pub server_id: String,
    pub item_id: String,
}

#[tauri::command]
pub fn media_list_children(
    state: State<'_, AppState>,
    request: ListChildrenRequest,
) -> AppResult<PagedResult<LibraryItem>> {
    list_children_for_state(&state, request)
}

pub fn list_children_for_state(
    state: &AppState,
    request: ListChildrenRequest,
) -> AppResult<PagedResult<LibraryItem>> {
    emby_provider_for_state(state).list_children(request)
}

#[tauri::command]
pub fn media_get_item(
    state: State<'_, AppState>,
    request: GetItemRequest,
) -> AppResult<LibraryItemDetail> {
    get_item_for_state(&state, request)
}

pub fn get_item_for_state(
    state: &AppState,
    request: GetItemRequest,
) -> AppResult<LibraryItemDetail> {
    emby_provider_for_state(state).get_item(&request.server_id, &request.item_id)
}
