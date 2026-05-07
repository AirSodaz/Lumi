import { invoke } from "@tauri-apps/api/core";

import type { AppSettings, AppSettingsPatch } from "./types";

export const settings = {
  get() {
    return invoke<AppSettings>("settings_get");
  },

  update(patch: AppSettingsPatch) {
    return invoke<AppSettings>("settings_update", { patch });
  },
};
