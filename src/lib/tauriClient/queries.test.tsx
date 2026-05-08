import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  useLogout,
  useChildren,
  useHomeRows,
  useItemDetail,
  useLibraries,
  useServers,
  useUpdateServerProfile,
} from "./queries";

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

  it("loads children only when a server id is available", async () => {
    invokeMock.mockResolvedValueOnce({
      items: [
        {
          id: "movie-1",
          providerKind: "emby",
          serverId: "server-1",
          itemType: "movie",
          title: "Demo Movie",
        },
      ],
      nextCursor: null,
    });

    const { result, rerender } = renderHook(
      ({ serverId }) => useChildren(serverId, "library-1"),
      {
        initialProps: { serverId: null as string | null },
        wrapper,
      },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(invokeMock).not.toHaveBeenCalled();

    rerender({ serverId: "server-1" });

    await waitFor(() => expect(result.current.data?.items[0]?.title).toBe("Demo Movie"));
    expect(invokeMock).toHaveBeenCalledWith("media_list_children", {
      request: { serverId: "server-1", parentId: "library-1", cursor: null },
    });
  });

  it("loads home rows only when server and libraries are available", async () => {
    invokeMock.mockResolvedValueOnce({
      continueWatching: [
        {
          id: "movie-1",
          providerKind: "emby",
          serverId: "server-1",
          itemType: "movie",
          title: "Demo Movie",
          playedPercentage: 45,
          playbackPositionSeconds: 1800,
        },
      ],
      latestByLibrary: [
        {
          libraryId: "library-1",
          items: [
            {
              id: "movie-2",
              providerKind: "emby",
              serverId: "server-1",
              itemType: "movie",
              title: "Latest Movie",
            },
          ],
        },
      ],
    });

    const { result, rerender } = renderHook(
      ({ libraryIds, serverId }) => useHomeRows(serverId, libraryIds),
      {
        initialProps: {
          libraryIds: [] as string[],
          serverId: null as string | null,
        },
        wrapper,
      },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(invokeMock).not.toHaveBeenCalled();

    rerender({ libraryIds: [], serverId: "server-1" });

    expect(result.current.fetchStatus).toBe("idle");
    expect(invokeMock).not.toHaveBeenCalled();

    rerender({ libraryIds: ["library-1"], serverId: "server-1" });

    await waitFor(() =>
      expect(result.current.data?.continueWatching[0]?.title).toBe("Demo Movie"),
    );
    expect(invokeMock).toHaveBeenCalledWith("media_get_home_rows", {
      request: {
        continueWatchingLimit: 10,
        latestLimit: 10,
        libraryIds: ["library-1"],
        serverId: "server-1",
      },
    });
  });

  it("loads item detail only when server id and item id are available", async () => {
    invokeMock.mockResolvedValueOnce({
      item: {
        id: "movie-1",
        providerKind: "emby",
        serverId: "server-1",
        itemType: "movie",
        title: "Demo Movie",
      },
      mediaSources: [],
    });

    const { result, rerender } = renderHook(
      ({ serverId, itemId }) => useItemDetail(serverId, itemId),
      {
        initialProps: {
          serverId: "server-1" as string | null,
          itemId: null as string | null,
        },
        wrapper,
      },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(invokeMock).not.toHaveBeenCalled();

    rerender({ serverId: "server-1", itemId: "movie-1" });

    await waitFor(() => expect(result.current.data?.item.title).toBe("Demo Movie"));
    expect(invokeMock).toHaveBeenCalledWith("media_get_item", {
      request: { serverId: "server-1", itemId: "movie-1" },
    });
  });

  it("invalidates servers after logout", async () => {
    invokeMock.mockResolvedValueOnce(null);

    const { result } = renderHook(() => useLogout(), { wrapper });

    result.current.mutate({ serverId: "server-1" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invokeMock).toHaveBeenCalledWith("auth_logout", {
      request: { serverId: "server-1" },
    });
  });

  it("updates saved server profiles through the typed provider client", async () => {
    invokeMock.mockResolvedValueOnce({
      id: "server-1",
      providerKind: "emby",
      name: "Living Room",
      baseUrl: "http://localhost:8096",
      userId: "user-1",
      createdAt: "2026-05-07T00:00:00Z",
      updatedAt: "2026-05-08T00:00:00Z",
    });

    const { result } = renderHook(() => useUpdateServerProfile(), { wrapper });

    result.current.mutate({ serverId: "server-1", name: "Living Room" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invokeMock).toHaveBeenCalledWith("providers_update_server_profile", {
      request: { serverId: "server-1", name: "Living Room" },
    });
  });
});
