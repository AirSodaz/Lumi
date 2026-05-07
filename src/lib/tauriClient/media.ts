import { invoke } from "@tauri-apps/api/core";

import type {
  GetItemRequest,
  LibraryItem,
  LibraryItemDetail,
  ListChildrenRequest,
  PagedResult,
} from "./types";

export const media = {
  listChildren(request: ListChildrenRequest) {
    return invoke<PagedResult<LibraryItem>>("media_list_children", { request });
  },

  getItem(request: GetItemRequest) {
    return invoke<LibraryItemDetail>("media_get_item", { request });
  },
};
