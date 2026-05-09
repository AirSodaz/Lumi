import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { auth } from "./auth";
import { media } from "./media";
import { playback } from "./playback";
import { providers } from "./providers";
import { settings } from "./settings";
import type {
  AppSettingsPatch,
  CreateServerLineRequest,
  DeleteServerLineRequest,
  LogoutRequest,
  LoginManualRequest,
  PlaybackCommandRequest,
  PlayerOpenRequest,
  SelectServerLineRequest,
  ServerProfile,
  UpdateServerLineRequest,
  UpdateServerProfileRequest,
} from "./types";

const QUERY_STALE_TIME_MS = 60_000;
const HOME_CONTINUE_WATCHING_LIMIT = 10;
const HOME_LATEST_LIMIT = 10;

export const queryKeys = {
  settings: ["settings"] as const,
  servers: ["servers"] as const,
  libraries: (serverId: string) => ["libraries", serverId] as const,
  children: (serverId: string, parentId: string | null, cursor: string | null) =>
    ["children", serverId, parentId ?? "root", cursor ?? "first"] as const,
  favorites: (serverId: string) => ["favorites", serverId] as const,
  homeRows: (serverId: string, libraryIds: readonly string[]) =>
    ["homeRows", serverId, libraryIds.join(":")] as const,
  itemDetail: (serverId: string, itemId: string) =>
    ["itemDetail", serverId, itemId] as const,
  materialState: ["materialState"] as const,
  mpvDiagnostic: ["mpvDiagnostic"] as const,
  playbackSession: (sessionId: string) => ["playbackSession", sessionId] as const,
};

export function useServers() {
  return useQuery({
    queryKey: queryKeys.servers,
    queryFn: providers.listServers,
    staleTime: QUERY_STALE_TIME_MS,
  });
}

export function useLibraries(serverId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.libraries(serverId ?? "none"),
    queryFn: () => providers.listLibraries({ serverId: serverId ?? "" }),
    enabled: Boolean(serverId),
    staleTime: QUERY_STALE_TIME_MS,
  });
}

export function useChildren(
  serverId: string | null | undefined,
  parentId?: string | null,
  cursor?: string | null,
) {
  return useQuery({
    queryKey: queryKeys.children(serverId ?? "none", parentId ?? null, cursor ?? null),
    queryFn: () =>
      media.listChildren({
        serverId: serverId ?? "",
        parentId: parentId ?? null,
        cursor: cursor ?? null,
      }),
    enabled: Boolean(serverId),
    staleTime: QUERY_STALE_TIME_MS,
  });
}

export function useFavorites(serverId: string | null | undefined) {
  return useInfiniteQuery({
    queryKey: queryKeys.favorites(serverId ?? "none"),
    queryFn: ({ pageParam }) =>
      media.listFavorites({
        serverId: serverId ?? "",
        cursor: pageParam,
      }),
    enabled: Boolean(serverId),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: QUERY_STALE_TIME_MS,
  });
}

export function useHomeRows(
  serverId: string | null | undefined,
  libraryIds: readonly string[],
) {
  return useQuery({
    queryKey: queryKeys.homeRows(serverId ?? "none", libraryIds),
    queryFn: () =>
      media.getHomeRows({
        continueWatchingLimit: HOME_CONTINUE_WATCHING_LIMIT,
        latestLimit: HOME_LATEST_LIMIT,
        libraryIds: [...libraryIds],
        serverId: serverId ?? "",
      }),
    enabled: Boolean(serverId && libraryIds.length > 0),
    staleTime: QUERY_STALE_TIME_MS,
  });
}

export function useItemDetail(
  serverId: string | null | undefined,
  itemId: string | null | undefined,
) {
  return useQuery({
    queryKey: queryKeys.itemDetail(serverId ?? "none", itemId ?? "none"),
    queryFn: () =>
      media.getItem({
        serverId: serverId ?? "",
        itemId: itemId ?? "",
      }),
    enabled: Boolean(serverId && itemId),
    staleTime: QUERY_STALE_TIME_MS,
  });
}

export function useLoginManual() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: LoginManualRequest) => auth.loginManual(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.servers });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: LogoutRequest) => auth.logout(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.servers });
      void queryClient.invalidateQueries({ queryKey: ["libraries"] });
      void queryClient.invalidateQueries({ queryKey: ["homeRows"] });
      void queryClient.invalidateQueries({ queryKey: ["favorites"] });
    },
  });
}

export function useUpdateServerProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: UpdateServerProfileRequest) =>
      providers.updateServerProfile(request),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.servers, (servers: unknown) =>
        Array.isArray(servers)
          ? servers.map((server) =>
              isServerProfile(server) && server.id === updated.id ? updated : server,
            )
          : servers,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.servers });
    },
  });
}

export function useCreateServerLine() {
  return useServerLineMutation<CreateServerLineRequest>(providers.createServerLine);
}

export function useUpdateServerLine() {
  return useServerLineMutation<UpdateServerLineRequest>(providers.updateServerLine);
}

export function useSelectServerLine() {
  return useServerLineMutation<SelectServerLineRequest>(providers.selectServerLine);
}

export function useDeleteServerLine() {
  return useServerLineMutation<DeleteServerLineRequest>(providers.deleteServerLine);
}

type ServerLineMutationRequest =
  | CreateServerLineRequest
  | UpdateServerLineRequest
  | SelectServerLineRequest
  | DeleteServerLineRequest;

function useServerLineMutation<TRequest extends ServerLineMutationRequest>(
  mutationFn: (request: TRequest) => Promise<ServerProfile>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.servers, (servers: unknown) =>
        Array.isArray(servers)
          ? servers.map((server) =>
              isServerProfile(server) && server.id === updated.id ? updated : server,
            )
          : servers,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.servers });
      void queryClient.invalidateQueries({ queryKey: ["libraries"] });
      void queryClient.invalidateQueries({ queryKey: ["children"] });
      void queryClient.invalidateQueries({ queryKey: ["homeRows"] });
      void queryClient.invalidateQueries({ queryKey: ["favorites"] });
      void queryClient.invalidateQueries({ queryKey: ["itemDetail"] });
    },
  });
}

export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: settings.get,
    staleTime: QUERY_STALE_TIME_MS,
  });
}

export function useMaterialState() {
  return useQuery({
    queryKey: queryKeys.materialState,
    queryFn: settings.getMaterialState,
    staleTime: QUERY_STALE_TIME_MS,
  });
}

export function useMpvDiagnostic() {
  return useQuery({
    queryKey: queryKeys.mpvDiagnostic,
    queryFn: settings.diagnoseMpv,
    staleTime: QUERY_STALE_TIME_MS,
  });
}

export function useExportLogs() {
  return useMutation({
    mutationFn: settings.exportLogs,
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (patch: AppSettingsPatch) => settings.update(patch),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.settings, updated);
      void queryClient.invalidateQueries({ queryKey: queryKeys.settings });
    },
  });
}

export function useOpenPlayback() {
  return useMutation({
    mutationFn: (request: PlayerOpenRequest) => playback.open(request),
  });
}

export function usePlaybackSession(sessionId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.playbackSession(sessionId ?? "none"),
    queryFn: () => playback.getSession(sessionId ?? ""),
    enabled: Boolean(sessionId),
    staleTime: QUERY_STALE_TIME_MS,
  });
}

export function usePlaybackCommand() {
  return useMutation({
    mutationFn: (request: PlaybackCommandRequest) => playback.command(request),
  });
}

function isServerProfile(value: unknown): value is { id: string } {
  return typeof value === "object" && value !== null && "id" in value;
}
