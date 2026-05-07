import { invoke } from "@tauri-apps/api/core";

import type { LoginManualRequest, ServerProfile } from "./types";

export const auth = {
  loginManual(request: LoginManualRequest) {
    return invoke<ServerProfile>("auth_login_manual", { request });
  },
};
