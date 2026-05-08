import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  AppError,
  PlaybackErrorEvent,
  PlaybackPositionEvent,
  PlaybackCommandRequest,
  PlayerOpenRequest,
  PlayerSession,
} from "./types";

const PLAYBACK_STATE_CHANGED = "playback:state-changed";
const PLAYBACK_POSITION = "playback:position";
const PLAYBACK_ERROR = "playback:error";

export const playback = {
  open(request: PlayerOpenRequest) {
    return invoke<PlayerSession>("playback_open", { request });
  },
  getSession(sessionId: string) {
    return invoke<PlayerSession>("playback_get_session", { sessionId });
  },
  command(request: PlaybackCommandRequest) {
    return invoke<PlayerSession>("playback_command", { request });
  },
  onStateChanged(handler: (session: PlayerSession) => void) {
    return listen<PlayerSession>(PLAYBACK_STATE_CHANGED, (event) => {
      handler(event.payload);
    });
  },
  onPosition(handler: (event: PlaybackPositionEvent) => void) {
    return listen<PlaybackPositionEvent>(PLAYBACK_POSITION, (event) => {
      handler(event.payload);
    });
  },
  onError(handler: (event: PlaybackErrorEvent) => void) {
    return listen<PlaybackErrorEvent>(PLAYBACK_ERROR, (event) => {
      handler(event.payload);
    });
  },
};

export function playbackEventToAppError(event: PlaybackErrorEvent): AppError {
  return {
    code: event.code,
    message: event.message,
    recoverable: true,
  };
}
