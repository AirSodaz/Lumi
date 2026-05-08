import { invoke } from "@tauri-apps/api/core";

import type { LoginManualRequest, LogoutRequest, ServerProfile } from "./types";

export const auth = {
  loginManual(request: LoginManualRequest) {
    return invoke<ServerProfile>("auth_login_manual", { request });
  },

  logout(request: LogoutRequest) {
    return invoke<void>("auth_logout", { request });
  },
};
