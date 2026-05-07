import { invoke } from "@tauri-apps/api/core";

export function getBootstrapStatus() {
  return invoke<string>("get_bootstrap_status");
}
