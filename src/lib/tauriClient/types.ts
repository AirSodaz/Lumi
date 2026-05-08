export type ProviderKind = "emby";

export type ServerProfile = {
  id: string;
  providerKind: ProviderKind;
  name: string;
  baseUrl: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
};

export type AppError = {
  code: string;
  message: string;
  recoverable: boolean;
  detail?: unknown;
};

export type ThemePreference = "system" | "light" | "dark";
export type SubtitlePreference = "serverDefault" | "always" | "off";

export type PlayerSettings = {
  defaultVolume: number;
  subtitlePreference: SubtitlePreference;
};

export type AppSettings = {
  theme: ThemePreference;
  materialEffectsEnabled: boolean;
  player: PlayerSettings;
};

export type AppSettingsPatch = Partial<
  Pick<AppSettings, "materialEffectsEnabled" | "theme"> & PlayerSettings
>;

export type MaterialState = {
  kind: "nativeMaterial" | "contentGlass" | "fallbackSurface" | string;
  status: "available" | "fallback" | "disabled" | string;
  reason: string;
};

export type MpvDiagnostic = {
  status: "available" | "missing" | "error" | string;
  message: string;
};

export type LogExport = {
  fileName: string;
  contents: string;
};

export type LoginManualRequest = {
  baseUrl: string;
  displayName?: string;
  username: string;
  password: string;
};

export type LogoutRequest = {
  serverId: string;
};

export type UpdateServerProfileRequest = {
  serverId: string;
  name: string;
};

export type LibraryItem = {
  id: string;
  providerKind: ProviderKind;
  serverId: string;
  itemType: string;
  title: string;
  sortTitle?: string | null;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  year?: number | null;
  runtimeSeconds?: number | null;
  overview?: string | null;
  playedPercentage?: number | null;
  playbackPositionSeconds?: number | null;
};

export type MediaSource = {
  id: string;
  name: string;
  url: string;
};

export type LibraryItemDetail = {
  item: LibraryItem;
  mediaSources: MediaSource[];
};

export type PagedResult<T> = {
  items: T[];
  nextCursor?: string | null;
};

export type ListLibrariesRequest = {
  serverId: string;
};

export type ListChildrenRequest = {
  serverId: string;
  parentId?: string | null;
  cursor?: string | null;
};

export type HomeRowsRequest = {
  serverId: string;
  libraryIds: string[];
  continueWatchingLimit?: number | null;
  latestLimit?: number | null;
};

export type HomeRows = {
  continueWatching: LibraryItem[];
  latestByLibrary: LatestLibraryItems[];
};

export type LatestLibraryItems = {
  libraryId: string;
  items: LibraryItem[];
};

export type GetItemRequest = {
  serverId: string;
  itemId: string;
};

export type PlayerState =
  | "opening"
  | "playing"
  | "paused"
  | "buffering"
  | "ended"
  | "error"
  | "closed";

export type PlayerSession = {
  id: string;
  serverId: string;
  itemId: string;
  state: PlayerState;
  positionSeconds: number;
};

export type PlaybackPositionEvent = {
  sessionId: string;
  positionSeconds: number;
};

export type PlaybackErrorEvent = {
  sessionId?: string | null;
  code: string;
  message: string;
};

export type PlayerOpenRequest = {
  serverId: string;
  itemId: string;
  mediaSourceId?: string | null;
};

export type PlaybackCommand =
  | { kind: "play" }
  | { kind: "pause" }
  | { kind: "seek"; positionSeconds: number }
  | { kind: "setVolume"; volume: number }
  | { kind: "close" };

export type PlaybackCommandRequest = {
  sessionId: string;
  command: PlaybackCommand;
};
