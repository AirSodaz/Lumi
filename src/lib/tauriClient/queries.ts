import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { auth } from "./auth";
import { providers } from "./providers";
import { settings } from "./settings";
import type { AppSettingsPatch, LoginManualRequest } from "./types";

export const queryKeys = {
  settings: ["settings"] as const,
  servers: ["servers"] as const,
  libraries: (serverId: string) => ["libraries", serverId] as const,
};

export function useServers() {
  return useQuery({
    queryKey: queryKeys.servers,
    queryFn: providers.listServers,
  });
}

export function useLibraries(serverId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.libraries(serverId ?? "none"),
    queryFn: () => providers.listLibraries({ serverId: serverId ?? "" }),
    enabled: Boolean(serverId),
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
