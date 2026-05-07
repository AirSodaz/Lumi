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

export type AppSettings = {
  theme: ThemePreference;
  materialEffectsEnabled: boolean;
};

export type AppSettingsPatch = Partial<AppSettings>;

export type LoginManualRequest = {
  baseUrl: string;
  username: string;
  password: string;
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

export type GetItemRequest = {
  serverId: string;
  itemId: string;
};
