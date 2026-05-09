import { invoke } from "@tauri-apps/api/core";

import type {
  CreateServerLineRequest,
  DeleteServerLineRequest,
  LibraryItem,
  ListLibrariesRequest,
  SelectServerLineRequest,
  ServerProfile,
  UpdateServerLineRequest,
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

  createServerLine(request: CreateServerLineRequest) {
    return invoke<ServerProfile>("providers_create_server_line", { request });
  },

  updateServerLine(request: UpdateServerLineRequest) {
    return invoke<ServerProfile>("providers_update_server_line", { request });
  },

  selectServerLine(request: SelectServerLineRequest) {
    return invoke<ServerProfile>("providers_select_server_line", { request });
  },

  deleteServerLine(request: DeleteServerLineRequest) {
    return invoke<ServerProfile>("providers_delete_server_line", { request });
  },
};
