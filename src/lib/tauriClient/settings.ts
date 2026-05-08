import { invoke } from "@tauri-apps/api/core";

import type {
  AppSettings,
  AppSettingsPatch,
  LogExport,
  MaterialState,
  MpvDiagnostic,
} from "./types";

export const settings = {
  get() {
    return invoke<AppSettings>("settings_get");
  },

  update(patch: AppSettingsPatch) {
    return invoke<AppSettings>("settings_update", { patch });
  },

  getMaterialState() {
    return invoke<MaterialState>("settings_get_material_state");
  },

  diagnoseMpv() {
    return invoke<MpvDiagnostic>("settings_diagnose_mpv");
  },

  exportLogs() {
    return invoke<LogExport>("settings_export_logs");
  },
};
