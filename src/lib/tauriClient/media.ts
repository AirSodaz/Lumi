import { invoke } from "@tauri-apps/api/core";

import type {
  GetItemRequest,
  HomeRows,
  HomeRowsRequest,
  LibraryItem,
  LibraryItemDetail,
  ListChildrenRequest,
  ListFavoritesRequest,
  PagedResult,
} from "./types";

export const media = {
  listChildren(request: ListChildrenRequest) {
    return invoke<PagedResult<LibraryItem>>("media_list_children", { request });
  },

  listFavorites(request: ListFavoritesRequest) {
    return invoke<PagedResult<LibraryItem>>("media_list_favorites", { request });
  },

  getItem(request: GetItemRequest) {
    return invoke<LibraryItemDetail>("media_get_item", { request });
  },

  getHomeRows(request: HomeRowsRequest) {
    return invoke<HomeRows>("media_get_home_rows", { request });
  },
};
