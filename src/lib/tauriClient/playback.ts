import { invoke } from "@tauri-apps/api/core";
import type {
  PlaybackCommandRequest,
  PlayerOpenRequest,
  PlayerSession,
} from "./types";

export const playback = {
  open(request: PlayerOpenRequest) {
    return invoke<PlayerSession>("playback_open", { request });
  },
  command(request: PlaybackCommandRequest) {
    return invoke<PlayerSession>("playback_command", { request });
  },
};
