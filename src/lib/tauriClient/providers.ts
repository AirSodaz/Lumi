import { invoke } from "@tauri-apps/api/core";

import type {
  LibraryItem,
  ListLibrariesRequest,
  ServerProfile,
  UpdateServerProfileRequest,
} from "./types";

export const providers = {
  listServers() {
    return invoke<ServerProfile[]>("providers_list_servers");
  },

  listLibraries(request: ListLibrariesRequest) {
    return invoke<LibraryItem[]>("providers_list_libraries", { request });
  },

  updateServerProfile(request: UpdateServerProfileRequest) {
    return invoke<ServerProfile>("providers_update_server_profile", { request });
  },
};
