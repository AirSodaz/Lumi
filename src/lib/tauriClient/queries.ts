import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { auth } from "./auth";
import { media } from "./media";
import { providers } from "./providers";
import { settings } from "./settings";
import type { AppSettingsPatch, LoginManualRequest } from "./types";

const QUERY_STALE_TIME_MS = 60_000;

export const queryKeys = {
  settings: ["settings"] as const,
  servers: ["servers"] as const,
  libraries: (serverId: string) => ["libraries", serverId] as const,
  children: (serverId: string, parentId: string | null, cursor: string | null) =>
    ["children", serverId, parentId ?? "root", cursor ?? "first"] as const,
  itemDetail: (serverId: string, itemId: string) =>
    ["itemDetail", serverId, itemId] as const,
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

export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: settings.get,
    staleTime: QUERY_STALE_TIME_MS,
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
