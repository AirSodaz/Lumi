import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { useLibraries, useServers } from "./queries";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("tauri query hooks", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("loads saved servers through the typed provider client", async () => {
    invokeMock.mockResolvedValueOnce([
      {
        id: "server-1",
        providerKind: "emby",
        name: "Demo Server",
        baseUrl: "http://localhost:8096",
        userId: "user-1",
        createdAt: "2026-05-07T00:00:00Z",
        updatedAt: "2026-05-07T00:00:00Z",
      },
    ]);

    const { result } = renderHook(() => useServers(), { wrapper });

    await waitFor(() => expect(result.current.data?.[0]?.name).toBe("Demo Server"));
    expect(invokeMock).toHaveBeenCalledWith("providers_list_servers");
  });

  it("loads libraries only when a server id is available", async () => {
    invokeMock.mockResolvedValueOnce([]);

    const { result, rerender } = renderHook(
      ({ serverId }) => useLibraries(serverId),
      {
        initialProps: { serverId: null as string | null },
        wrapper,
      },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(invokeMock).not.toHaveBeenCalled();

    rerender({ serverId: "server-1" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invokeMock).toHaveBeenCalledWith("providers_list_libraries", {
      request: { serverId: "server-1" },
    });
  });
});
