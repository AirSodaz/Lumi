import { invoke } from "@tauri-apps/api/core";

import type { LibraryItem, ListLibrariesRequest, ServerProfile } from "./types";

export const providers = {
  listServers() {
    return invoke<ServerProfile[]>("providers_list_servers");
  },

  listLibraries(request: ListLibrariesRequest) {
    return invoke<LibraryItem[]>("providers_list_libraries", { request });
  },
};
