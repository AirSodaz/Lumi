import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import App from "../../App";
import type { LibraryItem, LibraryItemDetail, ServerProfile } from "../../lib/tauriClient";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const windowApiMocks = vi.hoisted(() => ({
  close: vi.fn(),
  destroy: vi.fn(),
  minimize: vi.fn(),
  startDragging: vi.fn(),
  toggleMaximize: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => ({
    close: windowApiMocks.close,
    destroy: windowApiMocks.destroy,
    minimize: windowApiMocks.minimize,
    startDragging: windowApiMocks.startDragging,
    toggleMaximize: windowApiMocks.toggleMaximize,
  })),
}));

const originalLocation = window.location.href;
const invokeMock = vi.mocked(invoke);
const listenMock = vi.mocked(listen);
let scrollIntoViewMock: Mock;
let startViewTransitionMock: Mock;
const eventListeners = new Map<string, Set<(event: { payload: unknown }) => void>>();

const demoServer: ServerProfile = {
  id: "server-1",
  providerKind: "emby",
  name: "Demo Server",
  baseUrl: "http://localhost:8096",
  lines: [
    {
      id: "line-1",
      serverId: "server-1",
      name: "Primary",
      baseUrl: "http://localhost:8096",
      isActive: true,
      createdAt: "2026-05-07T00:00:00Z",
      updatedAt: "2026-05-07T00:00:00Z",
    },
  ],
  userId: "user-1",
  createdAt: "2026-05-07T00:00:00Z",
  updatedAt: "2026-05-07T00:00:00Z",
};

const secondServer: ServerProfile = {
  id: "server-2",
  providerKind: "emby",
  name: "Second Server",
  baseUrl: "http://localhost:8097",
  lines: [
    {
      id: "line-2",
      serverId: "server-2",
      name: "Primary",
      baseUrl: "http://localhost:8097",
      isActive: true,
      createdAt: "2026-05-07T00:00:00Z",
      updatedAt: "2026-05-07T00:00:00Z",
    },
  ],
  userId: "user-2",
  createdAt: "2026-05-07T00:00:00Z",
  updatedAt: "2026-05-07T00:00:00Z",
};

const moviesLibrary: LibraryItem = {
  id: "library-1",
  providerKind: "emby",
  serverId: "server-1",
  itemType: "folder",
  title: "Movies",
  posterUrl: null,
  backdropUrl: null,
};

const tvLibrary: LibraryItem = {
  id: "library-2",
  providerKind: "emby",
  serverId: "server-1",
  itemType: "folder",
  title: "TV Shows",
};

const secondServerLibrary: LibraryItem = {
  id: "library-3",
  providerKind: "emby",
  serverId: "server-2",
  itemType: "folder",
  title: "Kids",
};

const demoMovie: LibraryItem = {
  id: "movie-1",
  providerKind: "emby",
  serverId: "server-1",
  itemType: "movie",
  title: "Demo Movie",
  year: 2026,
  runtimeSeconds: 7200,
  overview: "A mapped movie.",
};

const secondMovie: LibraryItem = {
  id: "movie-2",
  providerKind: "emby",
  serverId: "server-1",
  itemType: "movie",
  title: "Second Movie",
};

const secondServerMovie: LibraryItem = {
  id: "movie-20",
  providerKind: "emby",
  serverId: "server-2",
  itemType: "movie",
  title: "Second Server Movie",
};

const thirdMovie: LibraryItem = {
  id: "movie-3",
  providerKind: "emby",
  serverId: "server-1",
  itemType: "movie",
  title: "Third Movie",
};

const fourthMovie: LibraryItem = {
  id: "movie-4",
  providerKind: "emby",
  serverId: "server-1",
  itemType: "movie",
  title: "Fourth Movie",
};

const fifthMovie: LibraryItem = {
  id: "movie-5",
  providerKind: "emby",
  serverId: "server-1",
  itemType: "movie",
  title: "Fifth Movie",
};

const sixthMovie: LibraryItem = {
  id: "movie-6",
  providerKind: "emby",
  serverId: "server-1",
  itemType: "movie",
  title: "Sixth Movie",
};

const demoVideo: LibraryItem = {
  id: "video-1",
  providerKind: "emby",
  serverId: "server-1",
  itemType: "video",
  title: "Home Video",
  overview: "A standalone video.",
};

const randomFeature: LibraryItem = {
  id: "featured-1",
  providerKind: "emby",
  serverId: "server-1",
  itemType: "movie",
  title: "Random Feature",
  overview: "A random library pick.",
  backdropUrl: "http://localhost:8096/Items/featured-1/Images/Backdrop?tag=random-backdrop",
  logoUrl: "http://localhost:8096/Items/featured-1/Images/Logo?tag=random-logo",
  posterUrl: "http://localhost:8096/Items/featured-1/Images/Primary?tag=random-poster",
};

const secondRandomFeature: LibraryItem = {
  id: "featured-2",
  providerKind: "emby",
  serverId: "server-1",
  itemType: "series",
  title: "Second Random Feature",
  overview: "Another random library pick.",
  backdropUrl: "http://localhost:8096/Items/featured-2/Images/Backdrop?tag=random-backdrop-2",
};

const nestedFolder: LibraryItem = {
  id: "folder-1",
  providerKind: "emby",
  serverId: "server-1",
  itemType: "folder",
  title: "Movie Folder",
  overview: "A playable container.",
};

const demoSeries: LibraryItem = {
  id: "series-1",
  providerKind: "emby",
  serverId: "server-1",
  itemType: "series",
  title: "Demo Series",
  overview: "A mapped series.",
};

const seasonOne: LibraryItem = {
  id: "season-1",
  providerKind: "emby",
  serverId: "server-1",
  itemType: "season",
  title: "Season 1",
};

const episodeOne: LibraryItem = {
  id: "episode-1",
  providerKind: "emby",
  serverId: "server-1",
  itemType: "episode",
  title: "Episode 1",
  year: 2026,
  runtimeSeconds: 1800,
};

type CommandArgs = {
  request?: {
    command?: unknown;
    itemId?: string;
    libraryIds?: string[];
    mediaSourceId?: string | null;
    parentId?: string | null;
    cursor?: string | null;
    serverId?: string;
    sessionId?: string;
  };
};

function itemDetail(item: LibraryItem): LibraryItemDetail {
  return {
    item,
    mediaSources: ["episode", "movie", "musicVideo", "video"].includes(item.itemType)
      ? [{ id: "source-1", name: "Direct", url: "http://localhost/stream.mkv" }]
      : [],
  };
}

function mockBrowsingCommands() {
  invokeMock.mockImplementation(mockBrowsingCommandsFallback);
}

function mockBrowsingCommandsFallback(command: string, args?: unknown) {
  const request = (args as CommandArgs | undefined)?.request;

  if (command === "settings_get") {
    return Promise.resolve({
      theme: "system",
      materialEffectsEnabled: true,
    });
  }
  if (command === "providers_list_servers") {
    return Promise.resolve([demoServer]);
  }
  if (command === "providers_list_libraries") {
    return Promise.resolve(
      request?.serverId === "server-2"
        ? [secondServerLibrary]
        : [moviesLibrary, tvLibrary],
    );
  }
  if (command === "media_get_home_rows") {
    if (request?.serverId === "server-2") {
      return Promise.resolve({
        continueWatching: [secondServerMovie],
        latestByLibrary: [
          {
            libraryId: "library-3",
            items: [secondServerMovie],
          },
        ],
        featuredItems: [secondServerMovie],
      });
    }

    return Promise.resolve({
      continueWatching: [
        {
          ...demoMovie,
          playedPercentage: 45,
          playbackPositionSeconds: 1800,
        },
      ],
      latestByLibrary: [
        {
          libraryId: "library-1",
          items: [
            secondMovie,
            thirdMovie,
            fourthMovie,
            fifthMovie,
            sixthMovie,
          ],
        },
        {
          libraryId: "library-2",
          items: [demoSeries],
        },
      ],
      featuredItems: [randomFeature, secondRandomFeature],
    });
  }
  if (command === "media_list_children") {
    const parentId = request?.parentId;
    const itemsByParent: Record<string, LibraryItem[]> = {
      "library-1": [
        demoMovie,
        secondMovie,
        thirdMovie,
        fourthMovie,
        fifthMovie,
        sixthMovie,
      ],
      "library-2": [demoSeries],
      "series-1": [seasonOne],
      "season-1": [episodeOne],
    };

    return Promise.resolve({
      items: itemsByParent[parentId ?? ""] ?? [],
      nextCursor: null,
    });
  }
  if (command === "media_list_favorites") {
    if (request?.serverId === "server-2") {
      return Promise.resolve({
        items: [secondServerMovie],
        nextCursor: null,
      });
    }

    return Promise.resolve({
      items: [demoMovie],
      nextCursor: null,
    });
  }
  if (command === "media_get_item") {
    const itemId = request?.itemId;
    const details: Record<string, LibraryItemDetail> = {
      "movie-1": itemDetail(demoMovie),
      "movie-2": itemDetail(secondMovie),
      "movie-3": itemDetail(thirdMovie),
      "movie-4": itemDetail(fourthMovie),
      "movie-5": itemDetail(fifthMovie),
      "movie-6": itemDetail(sixthMovie),
      "video-1": itemDetail(demoVideo),
      "folder-1": itemDetail(nestedFolder),
      "featured-1": itemDetail(randomFeature),
      "featured-2": itemDetail(secondRandomFeature),
      "series-1": itemDetail(demoSeries),
      "season-1": itemDetail(seasonOne),
      "episode-1": itemDetail(episodeOne),
    };

    return Promise.resolve(details[itemId ?? "movie-1"]);
  }
  if (command === "settings_update") {
    return Promise.resolve({
      theme: "dark",
      materialEffectsEnabled: true,
    });
  }
  if (command === "playback_open") {
    return Promise.resolve({
      id: "session-1",
      serverId: request?.serverId ?? "server-1",
      itemId: request?.itemId ?? "movie-1",
      state: "opening",
      positionSeconds: 0,
    });
  }
  if (command === "playback_get_session") {
    return Promise.resolve({
      id: args && typeof args === "object" && "sessionId" in args
        ? (args as { sessionId?: string }).sessionId ?? "session-1"
        : "session-1",
      serverId: "server-1",
      itemId: "movie-1",
      state: "opening",
      positionSeconds: 0,
    });
  }
  if (command === "playback_command") {
    return Promise.resolve({
      id: request?.sessionId ?? "session-1",
      serverId: "server-1",
      itemId: "movie-1",
      state: "paused",
      positionSeconds: 0,
    });
  }
  return Promise.resolve(null);
}

function getPosterCardButtonsByName(name: string | RegExp) {
  return screen
    .getAllByRole("button", { name })
    .filter((button) => button.classList.contains("poster-card"));
}

async function findPosterCardButtonByName(name: string | RegExp) {
  return await waitFor(() => {
    const button = getPosterCardButtonsByName(name)[0];

    if (!button) {
      throw new Error(`Expected a poster card named ${String(name)}`);
    }

    return button;
  });
}

describe("LumiShell", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", originalLocation);
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    });
    vi.useRealTimers();
    Object.values(windowApiMocks).forEach((mock) => {
      mock.mockReset();
      mock.mockResolvedValue(undefined);
    });
    scrollIntoViewMock = vi.fn();
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoViewMock,
    });
    startViewTransitionMock = vi.fn((callback: () => void) => {
      callback();

      return {
        finished: Promise.resolve(),
        ready: Promise.resolve(),
        skipTransition: vi.fn(),
        updateCallbackDone: Promise.resolve(),
      };
    });
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: startViewTransitionMock,
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn((query: string) => ({
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: false,
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    });
    window.localStorage.clear();
    eventListeners.clear();

    invokeMock.mockReset();
    listenMock.mockReset();
    listenMock.mockImplementation((event, handler) => {
      const listeners = eventListeners.get(event) ?? new Set();
      listeners.add(handler as (event: { payload: unknown }) => void);
      eventListeners.set(event, listeners);

      return Promise.resolve(() => {
        listeners.delete(handler as (event: { payload: unknown }) => void);
      });
    });
    invokeMock.mockImplementation((command: string) => {
      if (command === "settings_get") {
        return Promise.resolve({
          theme: "system",
          materialEffectsEnabled: true,
        });
      }
      if (command === "providers_list_servers") {
        return Promise.resolve([]);
      }
      if (command === "providers_list_libraries") {
        return Promise.resolve([]);
      }
      if (command === "settings_update") {
        return Promise.resolve({
          theme: "dark",
          materialEffectsEnabled: true,
        });
      }
      return Promise.resolve(null);
    });
  });

  it("renders Windows chrome with navigation and the current server tag", async () => {
    mockBrowsingCommands();
    render(<App />);

    await screen.findByRole("heading", { name: "Home" });

    const navigation = screen.getByLabelText("Window navigation");
    expect(within(navigation).getAllByRole("button")).toHaveLength(2);
    expect(within(navigation).getByRole("button", { name: "Go back" })).toBeDisabled();
    expect(within(navigation).getByRole("button", { name: "Go forward" })).toBeDisabled();
    expect(within(navigation).queryByRole("button", { name: /sidebar|pane|app menu/i })).not.toBeInTheDocument();
    expect(document.querySelector(".titlebar-menu-bar")).not.toBeInTheDocument();
    const identity = screen.getByLabelText("Application identity");
    expect(within(identity).getByText("Lumi")).toBeInTheDocument();
    await waitFor(() =>
      expect(within(identity).getByLabelText("Current site")).toHaveTextContent("Demo Server"),
    );
  });

  it("keeps macOS on native window chrome", async () => {
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/605.1.15",
    });

    render(<App />);

    await screen.findByRole("heading", { name: "Home" });

    expect(screen.queryByLabelText("Window navigation")).not.toBeInTheDocument();
    expect(document.querySelector(".titlebar-menu-bar")).not.toBeInTheDocument();
  });

  it("navigates route history from the Windows titlebar", async () => {
    const user = userEvent.setup();
    mockBrowsingCommands();

    render(<App />);

    const back = await screen.findByRole("button", { name: "Go back" });
    const forward = screen.getByRole("button", { name: "Go forward" });
    expect(back).toBeDisabled();
    expect(forward).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Favorites" }));
    expect(await screen.findByRole("heading", { name: "Favorites" })).toBeInTheDocument();
    expect(back).toBeEnabled();
    expect(forward).toBeDisabled();

    await user.click(back);
    expect(await screen.findByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(forward).toBeEnabled();

    await user.click(forward);
    expect(await screen.findByRole("heading", { name: "Favorites" })).toBeInTheDocument();
  });

  it("keeps Windows titlebar window controls", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("heading", { name: "Home" });
    expect(screen.queryByRole("button", { name: "File" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Minimize window" }));
    expect(windowApiMocks.minimize).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Maximize or restore window" }));
    expect(windowApiMocks.toggleMaximize).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Close window" }));
    expect(windowApiMocks.close).toHaveBeenCalledTimes(1);
  });

  it("renders product navigation and removes bootstrap copy", async () => {
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Favorites" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Libraries" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();

    expect(screen.queryByText("Emby-first provider")).not.toBeInTheDocument();
    expect(screen.queryByText("Native mpv playback")).not.toBeInTheDocument();
    expect(screen.queryByText("System material shell")).not.toBeInTheDocument();
  });

  it("renders Favorites from the selected Emby server", async () => {
    const user = userEvent.setup();
    mockBrowsingCommands();

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Favorites" }));

    expect(await screen.findByRole("heading", { name: "Favorites" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Demo Movie/ })).toBeInTheDocument();
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("media_list_favorites", {
        request: { serverId: "server-1", cursor: null },
      }),
    );
    expect(screen.queryByRole("heading", { name: "Libraries" })).not.toBeInTheDocument();
  });

  it("renders the shell in Chinese when the local language preference is Chinese", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("lumi.languagePreference", "zh");
    window.history.replaceState(null, "", "/?view=player&sessionId=session-1");
    mockBrowsingCommands();

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Lumi 播放器" })).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("lang", "zh-CN");
    expect(screen.getByLabelText("播放控制")).toBeInTheDocument();

    window.history.replaceState(null, "", originalLocation);
    render(<App />);

    expect(await screen.findByRole("heading", { name: "首页" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "收藏" }));
    expect(await screen.findByRole("heading", { name: "收藏" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Demo Movie/ })).toBeInTheDocument();
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("media_list_favorites", {
        request: { serverId: "server-1", cursor: null },
      }),
    );
    expect(screen.queryByRole("heading", { name: "Libraries" })).not.toBeInTheDocument();
  });

  it("opens media detail from Favorites and returns to Favorites", async () => {
    const user = userEvent.setup();
    mockBrowsingCommands();

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Favorites" }));
    const favoritesView = await screen.findByRole("region", { name: "Favorites" });
    await user.click(await within(favoritesView).findByRole("button", { name: /Demo Movie/ }));

    expect(await screen.findByRole("heading", { name: "Demo Movie" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to Favorites" }));
    expect(await screen.findByRole("heading", { name: "Favorites" })).toBeInTheDocument();
  });

  it("keeps Favorites empty state when the selected server has no favorites", async () => {
    const user = userEvent.setup();
    mockBrowsingCommands();
    invokeMock.mockImplementation((command: string, args?: unknown) => {
      if (command === "media_list_favorites") {
        return Promise.resolve({ items: [], nextCursor: null });
      }

      return mockBrowsingCommandsFallback(command, args);
    });

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Favorites" }));

    expect(await screen.findByText("No favorites yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Demo Movie/ })).not.toBeInTheDocument();
  });

  it("shows a safe Favorites error state", async () => {
    const user = userEvent.setup();
    mockBrowsingCommands();
    invokeMock.mockImplementation((command: string, args?: unknown) => {
      if (command === "media_list_favorites") {
        return Promise.reject({
          code: "emby.server",
          message: "Emby request failed",
          recoverable: true,
          detail: { token: "secret-token" },
        });
      }

      return mockBrowsingCommandsFallback(command, args);
    });

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Favorites" }));

    expect(await screen.findByText("Could not load favorites")).toBeInTheDocument();
    expect(screen.queryByText("secret-token")).not.toBeInTheDocument();
  });

  it("loads the next Favorites page when the sentinel enters view", async () => {
    const user = userEvent.setup();
    const observer = installIntersectionObserverMock();
    mockBrowsingCommands();
    invokeMock.mockImplementation((command: string, args?: unknown) => {
      const request = (args as CommandArgs | undefined)?.request;

      if (command === "media_list_favorites" && request?.cursor === null) {
        return Promise.resolve({ items: [demoMovie], nextCursor: "50" });
      }

      if (command === "media_list_favorites" && request?.cursor === "50") {
        return Promise.resolve({ items: [secondMovie], nextCursor: null });
      }

      return mockBrowsingCommandsFallback(command, args);
    });

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Favorites" }));
    const favoritesView = await screen.findByRole("region", { name: "Favorites" });
    expect(
      await within(favoritesView).findByRole("button", { name: /Demo Movie/ }),
    ).toBeInTheDocument();
    expect(await within(favoritesView).findByText("More favorites")).toBeInTheDocument();

    observer.emit(true);

    expect(
      await within(favoritesView).findByRole("button", { name: /Second Movie/ }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("media_list_favorites", {
        request: { serverId: "server-1", cursor: "50" },
      }),
    );
  });

  it("collapses and expands the sidebar while persisting the preference", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("heading", { name: "Home" });
    const shell = screen.getByLabelText("Primary").closest(".lumi-shell");
    expect(shell).toHaveAttribute("data-sidebar-collapsed", "false");

    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    expect(shell).toHaveAttribute("data-sidebar-collapsed", "true");
    expect(window.localStorage.getItem("lumi.sidebarCollapsed")).toBe("true");

    await user.click(screen.getByRole("button", { name: "Expand sidebar" }));

    expect(shell).toHaveAttribute("data-sidebar-collapsed", "false");
    expect(window.localStorage.getItem("lumi.sidebarCollapsed")).toBe("false");
  });

  it("keeps the sidebar toggle without rendering sidebar brand text or mark", async () => {
    render(<App />);

    await screen.findByRole("heading", { name: "Home" });

    const sidebar = screen.getByLabelText("Primary");
    expect(within(sidebar).getByRole("button", { name: "Collapse sidebar" })).toBeInTheDocument();
    expect(within(sidebar).queryByText("Lumi")).not.toBeInTheDocument();
    expect(within(sidebar).queryByText("L")).not.toBeInTheDocument();
  });

  it("loads the persisted collapsed sidebar preference", async () => {
    window.localStorage.setItem("lumi.sidebarCollapsed", "true");

    render(<App />);

    await screen.findByRole("heading", { name: "Home" });
    expect(screen.getByLabelText("Primary").closest(".lumi-shell")).toHaveAttribute(
      "data-sidebar-collapsed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("keeps collapsed sidebar navigation accessible and keyboard-navigable", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("lumi.sidebarCollapsed", "true");
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Favorites" }));
    expect(await screen.findByRole("heading", { name: "Favorites" })).toBeInTheDocument();

    const home = screen.getByRole("button", { name: "Home" });
    const favorites = screen.getByRole("button", { name: "Favorites" });
    home.focus();
    await user.keyboard("{ArrowDown}");

    expect(favorites).toHaveFocus();
    expect(screen.getByRole("heading", { name: "Favorites" })).toBeInTheDocument();
  });

  it("switches navigation with pointer and vertical arrow-key focus", async () => {
    const user = userEvent.setup();
    render(<App />);

    const favorites = await screen.findByRole("button", { name: "Favorites" });
    await user.click(favorites);
    expect(await screen.findByRole("heading", { name: "Favorites" })).toBeInTheDocument();

    const home = screen.getByRole("button", { name: "Home" });
    home.focus();
    await user.keyboard("{ArrowDown}");

    expect(favorites).toHaveFocus();
    expect(screen.getByRole("heading", { name: "Favorites" })).toBeInTheDocument();

    await user.keyboard("{ArrowUp}");

    expect(home).toHaveFocus();
    expect(await screen.findByRole("heading", { name: "Home" })).toBeInTheDocument();
  });

  it("uses view transitions for primary route changes when available", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Settings" }));

    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(startViewTransitionMock).toHaveBeenCalled();
  });

  it("skips view transitions for primary route changes when reduced motion is preferred", async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn((query: string) => ({
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    });
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Settings" }));

    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(startViewTransitionMock).not.toHaveBeenCalled();
  });

  it("moves from active sidebar navigation into the current media content with ArrowRight", async () => {
    const user = userEvent.setup();
    mockBrowsingCommands();

    render(<App />);

    const firstMovie = await screen.findByRole("button", { name: /Demo Movie/ });
    const home = screen.getByRole("button", { name: "Home" });
    scrollIntoViewMock.mockClear();

    home.focus();
    await user.keyboard("{ArrowRight}");

    expect(firstMovie).toHaveFocus();
    expect(scrollIntoViewMock).toHaveBeenCalled();
  });

  it("renders Emby-style Home rails from provider DTOs and opens media detail", async () => {
    const user = userEvent.setup();
    mockBrowsingCommands();

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Continue Watching" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Media Libraries" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Latest in Movies" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Latest in TV Shows" })).toBeInTheDocument();
    await screen.findByRole("button", { name: /Demo Movie/ });
    expect(screen.getByLabelText("45% watched")).toBeInTheDocument();
    expect(screen.getAllByText("No poster").length).toBeGreaterThan(0);

    await user.click(await screen.findByRole("button", { name: /Demo Movie/ }));

    const play = await screen.findByRole("button", { name: "Play" });
    expect(play).toBeEnabled();
    await user.click(play);
    expect(await screen.findByText("Opening")).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledWith("playback_open", {
      request: {
        serverId: "server-1",
        itemId: "movie-1",
        mediaSourceId: "source-1",
      },
    });
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("media_get_item", {
        request: { serverId: "server-1", itemId: "movie-1" },
      }),
    );
  });

  it("renders random featured items as a full-stage Home hero with logo artwork", async () => {
    mockBrowsingCommands();

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Random Feature" })).toBeInTheDocument();
    expect(screen.getByText("A random library pick.")).toBeInTheDocument();
    expect(screen.queryByText("Featured")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Demo Movie" })).not.toBeInTheDocument();

    const featuredHero = document.querySelector(".featured-hero");
    const backdropLayer = featuredHero?.querySelector(
      '.featured-backdrop-layer[data-featured-id="featured-1"]',
    );
    expect(featuredHero).toBeInTheDocument();
    expect(backdropLayer).toHaveStyle({
      "--featured-artwork":
        'url("http://localhost:8096/Items/featured-1/Images/Backdrop?tag=random-backdrop")',
    });
    expect(featuredHero?.querySelector(".featured-art")).not.toBeInTheDocument();
    expect(featuredHero?.querySelector(".hero-poster")).not.toBeInTheDocument();

    const logo = screen.getByRole("img", { name: "Random Feature" });
    expect(logo).toHaveAttribute(
      "src",
      "http://localhost:8096/Items/featured-1/Images/Logo?tag=random-logo",
    );
    expect(screen.queryByRole("button", { name: "More Info" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next featured item" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Previous featured item" })).not.toBeInTheDocument();
  });

  it("shows a focused no-server Home state and opens the Add Server dialog from it", async () => {
    const user = userEvent.setup();

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Connect your media library" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Add an Emby server to make Lumi feel like home.")).toBeInTheDocument();
    expect(screen.queryByText("Continue Watching")).not.toBeInTheDocument();
    expect(screen.queryByText("Media Libraries")).not.toBeInTheDocument();
    expect(screen.queryByText("Latest in Movies")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add Server" }));

    expect(await screen.findByRole("heading", { name: "Settings", hidden: true })).toBeInTheDocument();
    expect(await screen.findByRole("dialog", { name: "Add Emby Server" })).toBeInTheDocument();
    expect(screen.getByLabelText("Server URL")).toHaveFocus();
  });

  it("uses fallback text for featured items without logo artwork", async () => {
    const user = userEvent.setup();
    mockBrowsingCommands();

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Random Feature" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show Second Random Feature" }));

    expect(
      await screen.findByRole("heading", { name: "Second Random Feature" }),
    ).toBeInTheDocument();
    expect(document.querySelector(".featured-title-logo")).not.toBeInTheDocument();
  });

  it("advances the Home featured carousel with dots and opens the active item detail from the wallpaper", async () => {
    const user = userEvent.setup();
    mockBrowsingCommands();

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Random Feature" })).toBeInTheDocument();
    const featuredHero = document.querySelector(".featured-hero");
    const firstCopyLayer = featuredHero?.querySelector(".featured-copy");
    const firstBackdropLayer = featuredHero?.querySelector(
      '.featured-backdrop-layer[data-featured-id="featured-1"]',
    );
    expect(featuredHero).toBeInTheDocument();
    expect(firstBackdropLayer).toHaveStyle({
      "--featured-artwork":
        'url("http://localhost:8096/Items/featured-1/Images/Backdrop?tag=random-backdrop")',
    });
    expect(screen.getByRole("button", { name: "Show Random Feature" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Show Second Random Feature" }));

    expect(
      await screen.findByRole("heading", { name: "Second Random Feature" }),
    ).toBeInTheDocument();
    const secondBackdropLayer = featuredHero?.querySelector(
      '.featured-backdrop-layer[data-featured-id="featured-2"]',
    );
    const secondCopyLayer = featuredHero?.querySelector(
      '.featured-copy[data-featured-id="featured-2"]',
    );
    expect(document.querySelector(".featured-hero")).toBe(featuredHero);
    expect(secondBackdropLayer).toHaveStyle({
      "--featured-artwork":
        'url("http://localhost:8096/Items/featured-2/Images/Backdrop?tag=random-backdrop-2")',
    });
    expect(secondCopyLayer).toBeInTheDocument();
    expect(secondCopyLayer).not.toBe(firstCopyLayer);
    expect(screen.getByRole("button", { name: "Show Random Feature" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Show Second Random Feature" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Second Random Feature" }));

    expect(await screen.findByRole("heading", { name: "Second Random Feature" })).toBeInTheDocument();
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("media_get_item", {
        request: { serverId: "server-1", itemId: "featured-2" },
      }),
    );
  });

  it("auto-advances the Home featured carousel unless reduced motion is preferred", async () => {
    let intervalHandler: (() => void) | undefined;
    const originalSetInterval = window.setInterval.bind(window);
    const intervalSpy = vi
      .spyOn(window, "setInterval")
      .mockImplementation((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
        if (timeout === 8_000) {
          if (typeof handler === "function") {
            intervalHandler = () => handler();
          }

          return 1;
        }

        return originalSetInterval(handler, timeout, ...args);
      });
    mockBrowsingCommands();

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Random Feature" })).toBeInTheDocument();
    expect(intervalSpy).toHaveBeenCalled();

    const advanceFeaturedCarousel = intervalHandler;
    if (!advanceFeaturedCarousel) {
      throw new Error("Expected Home carousel interval callback");
    }
    act(() => {
      advanceFeaturedCarousel();
    });

    expect(
      await screen.findByRole("heading", { name: "Second Random Feature" }),
    ).toBeInTheDocument();

    intervalSpy.mockRestore();
  });

  it("does not auto-advance the Home featured carousel with reduced motion", async () => {
    const intervalSpy = vi.spyOn(window, "setInterval");
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn((query: string) => ({
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    });
    mockBrowsingCommands();

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Random Feature" })).toBeInTheDocument();
    expect(intervalSpy.mock.calls.some(([, timeout]) => timeout === 8_000)).toBe(false);
    expect(screen.getByRole("heading", { name: "Random Feature" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Second Random Feature" })).not.toBeInTheDocument();

    intervalSpy.mockRestore();
  });

  it("falls back to the old Home featured source when random featured items are empty", async () => {
    mockBrowsingCommands();
    invokeMock.mockImplementation((command: string, args?: unknown) => {
      if (command === "media_get_home_rows") {
        return Promise.resolve({
          continueWatching: [
            {
              ...demoMovie,
              playedPercentage: 45,
              playbackPositionSeconds: 1800,
            },
          ],
          latestByLibrary: [
            {
              libraryId: "library-1",
              items: [secondMovie],
            },
          ],
          featuredItems: [],
        });
      }

      return mockBrowsingCommandsFallback(command, args);
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Demo Movie" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next featured item" })).not.toBeInTheDocument();
  });

  it("keeps playback controls out of the main detail view after opening", async () => {
    const user = userEvent.setup();
    mockBrowsingCommands();

    render(<App />);

    await user.click(await screen.findByRole("button", { name: /Demo Movie/ }));
    await user.click(await screen.findByRole("button", { name: "Play" }));

    expect(await screen.findByText("Opening")).toBeInTheDocument();
    expect(screen.queryByLabelText("Playback controls")).not.toBeInTheDocument();
    emitTauriEvent("playback:state-changed", {
      id: "session-1",
      serverId: "server-1",
      itemId: "movie-1",
      state: "playing",
      positionSeconds: 0,
    });

    expect(screen.queryByText("Playing")).not.toBeInTheDocument();
    expect(listenMock).toHaveBeenCalledWith(
      "playback:state-changed",
      expect.any(Function),
    );
  });

  it("renders the player window route and updates playback controls from events", async () => {
    const user = userEvent.setup();
    mockBrowsingCommands();
    window.history.replaceState(null, "", "/?view=player&sessionId=session-1");

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Lumi Player" })).toBeInTheDocument();
    expect(screen.getByLabelText("Player window controls")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Minimize window" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Maximize or restore window" })).toBeInTheDocument();
    expect(await screen.findAllByText("Opening")).not.toHaveLength(0);
    expect(invokeMock).toHaveBeenCalledWith("playback_get_session", {
      sessionId: "session-1",
    });
    const controls = screen.getByLabelText("Playback controls");
    expect(controls).toBeInTheDocument();
    expect(controls).toHaveClass("player-controls-hud");

    emitTauriEvent("playback:state-changed", {
      id: "session-1",
      serverId: "server-1",
      itemId: "movie-1",
      state: "playing",
      positionSeconds: 0,
    });
    emitTauriEvent("playback:position", {
      sessionId: "session-1",
      positionSeconds: 75,
    });

    expect(await screen.findAllByText("Playing")).not.toHaveLength(0);
    expect(await screen.findByText("1:15")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close player" }));
    expect(invokeMock).toHaveBeenCalledWith("playback_command", {
      request: {
        sessionId: "session-1",
        command: { kind: "close" },
      },
    });
  });

  it("auto-hides the floating player HUD after idle and restores it on interaction", async () => {
    const user = userEvent.setup();
    mockBrowsingCommands();
    window.history.replaceState(
      null,
      "",
      "/?view=player&sessionId=session-1&surface=controls",
    );

    render(<App />);

    const playerWindow = await screen.findByLabelText("Lumi Player");
    const controlsRegion = screen.getByTestId("player-hud-region");
    expect(controlsRegion).toHaveAttribute("data-visible", "true");

    vi.useFakeTimers();
    act(() => {
      emitTauriEvent("playback:state-changed", {
        id: "session-1",
        serverId: "server-1",
        itemId: "movie-1",
        state: "playing",
        positionSeconds: 0,
      });
    });
    act(() => {
      vi.advanceTimersByTime(2_500);
    });

    expect(controlsRegion).toHaveAttribute("data-visible", "false");

    vi.useRealTimers();
    await user.pointer({ target: playerWindow, keys: "[MouseLeft]" });

    expect(controlsRegion).toHaveAttribute("data-visible", "true");
  });

  it("keeps the floating player HUD visible while opening or showing an error", async () => {
    mockBrowsingCommands();
    window.history.replaceState(null, "", "/?view=player&sessionId=session-1");

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Lumi Player" })).toBeInTheDocument();
    const controlsRegion = screen.getByTestId("player-hud-region");

    vi.useFakeTimers();
    act(() => {
      vi.advanceTimersByTime(3_000);
    });

    expect(controlsRegion).toHaveAttribute("data-visible", "true");

    emitTauriEvent("playback:error", {
      sessionId: "session-1",
      code: "playback.mpv_library_missing",
      message: "Native mpv library could not be loaded",
    });
    act(() => {
      vi.advanceTimersByTime(3_000);
    });

    expect(controlsRegion).toHaveAttribute("data-visible", "true");
  });

  it("keeps the player window responsive while buffering before the first frame", async () => {
    const user = userEvent.setup();
    mockBrowsingCommands();
    window.history.replaceState(null, "", "/?view=player&sessionId=session-1");

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Lumi Player" })).toBeInTheDocument();
    emitTauriEvent("playback:state-changed", {
      id: "session-1",
      serverId: "server-1",
      itemId: "movie-1",
      state: "buffering",
      positionSeconds: 0,
    });

    expect(await screen.findAllByText("Buffering")).not.toHaveLength(0);
    expect(screen.getByRole("button", { name: "Seek back" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Pause" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Seek forward" })).toBeDisabled();
    expect(screen.getByLabelText("Volume")).toBeDisabled();

    const close = screen.getByRole("button", { name: "Close player" });
    expect(close).toBeEnabled();
    await user.click(close);
    expect(invokeMock).toHaveBeenCalledWith("playback_command", {
      request: {
        sessionId: "session-1",
        command: { kind: "close" },
      },
    });
  });

  it("destroys the player window after the close button receives a closed session", async () => {
    const user = userEvent.setup();
    mockBrowsingCommands();
    invokeMock.mockImplementation((command: string, args?: unknown) => {
      const request = (args as CommandArgs | undefined)?.request;
      if (command === "playback_get_session") {
        return Promise.resolve({
          id: "session-1",
          serverId: "server-1",
          itemId: "movie-1",
          state: "playing",
          positionSeconds: 0,
        });
      }
      if (command === "playback_command") {
        return Promise.resolve({
          id: request?.sessionId ?? "session-1",
          serverId: "server-1",
          itemId: "movie-1",
          state: "closed",
          positionSeconds: 0,
        });
      }
      return mockBrowsingCommandsFallback(command, args);
    });
    window.history.replaceState(null, "", "/?view=player&sessionId=session-1");

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Lumi Player" })).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Close player" }));
    await waitFor(() => expect(windowApiMocks.destroy).toHaveBeenCalledTimes(1));
  });

  it("destroys the player window when the close command rejects", async () => {
    const user = userEvent.setup();
    mockBrowsingCommands();
    invokeMock.mockImplementation((command: string, args?: unknown) => {
      if (command === "playback_get_session") {
        return Promise.resolve({
          id: "session-1",
          serverId: "server-1",
          itemId: "movie-1",
          state: "playing",
          positionSeconds: 0,
        });
      }
      if (command === "playback_command") {
        return Promise.reject({
          code: "playback.command_failed",
          message: "Native mpv command failed",
          recoverable: true,
        });
      }
      return mockBrowsingCommandsFallback(command, args);
    });
    window.history.replaceState(null, "", "/?view=player&sessionId=session-1");

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Lumi Player" })).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Close player" }));

    await waitFor(() => expect(windowApiMocks.destroy).toHaveBeenCalledTimes(1));
  });

  it("reports the measured video region bounds to the native playback surface", async () => {
    mockBrowsingCommands();
    window.history.replaceState(null, "", "/?view=player&sessionId=session-1");

    render(<App />);

    const videoRegion = await screen.findByLabelText("Video");
    vi.spyOn(videoRegion, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      width: 960,
      height: 528,
      top: 0,
      right: 960,
      bottom: 528,
      left: 0,
      toJSON: () => ({}),
    } as DOMRect);
    window.dispatchEvent(new Event("resize"));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("playback_update_surface_bounds", {
        bounds: {
          sessionId: "session-1",
          x: 0,
          y: 0,
          width: 960,
          height: 528,
        },
      }),
    );
  });

  it("renders only controls when loaded as the native player child webview", async () => {
    mockBrowsingCommands();
    window.history.replaceState(
      null,
      "",
      "/?view=player&sessionId=session-1&surface=controls",
    );

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Lumi Player" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Video")).not.toBeInTheDocument();
    expect(invokeMock).not.toHaveBeenCalledWith(
      "playback_update_surface_bounds",
      expect.anything(),
    );
  });

  it("shows player window errors without exposing stream URLs or tokens", async () => {
    mockBrowsingCommands();
    window.history.replaceState(null, "", "/?view=player&sessionId=session-1");

    render(<App />);

    expect(await screen.findAllByText("Opening")).not.toHaveLength(0);
    emitTauriEvent("playback:error", {
      sessionId: "session-1",
      code: "playback.mpv_library_missing",
      message: "Native mpv library could not be loaded",
      detail: {
        mediaUrl: "http://localhost/stream.mkv?api_key=token-value",
      },
    });

    expect(await screen.findByText("Native mpv library could not be loaded")).toBeInTheDocument();
    expect(screen.getByText("playback.mpv_library_missing")).toBeInTheDocument();
    expect(screen.queryByText(/api_key=token-value/)).not.toBeInTheDocument();
    expect(screen.queryByText(/stream\.mkv/)).not.toBeInTheDocument();
  });

  it("opens Home library cards into the library browser", async () => {
    const user = userEvent.setup();
    mockBrowsingCommands();

    render(<App />);

    const moviesLibraryCard = await screen.findByRole("button", { name: "Movies" });
    const mediaLibrariesRail = moviesLibraryCard.closest(".media-rail");
    if (!(mediaLibrariesRail instanceof HTMLElement)) {
      throw new Error("Expected Movies to render inside the Media Libraries rail");
    }
    const mediaLibrariesItems = mediaLibrariesRail.querySelector(".rail-items");
    expect(mediaLibrariesItems).toHaveAttribute("data-grid-orientation", "landscape");
    expect(mediaLibrariesItems).toHaveAttribute("data-card-size", "compact");
    expect(within(mediaLibrariesRail).getByRole("button", { name: "Movies" })).toHaveAttribute(
      "data-card-orientation",
      "landscape",
    );

    await user.click(moviesLibraryCard);

    expect(await screen.findByRole("heading", { name: "Movies" })).toBeInTheDocument();
    expect(document.querySelector(".libraries-view .workbench-header")).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Demo Movie/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to Home" }));
    expect(await screen.findByRole("heading", { name: "Home" })).toBeInTheDocument();
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("media_list_children", {
        request: { serverId: "server-1", parentId: "library-1", cursor: null },
      }),
    );
  });

  it("switches the active server and persists the selection", async () => {
    const user = userEvent.setup();
    mockBrowsingCommands();
    invokeMock.mockImplementation((command: string, args?: unknown) => {
      if (command === "providers_list_servers") {
        return Promise.resolve([demoServer, secondServer]);
      }

      return mockBrowsingCommandsFallback(command, args);
    });

    render(<App />);

    await screen.findByRole("button", { name: /Demo Movie/ });
    expect(screen.queryByRole("button", { name: "Demo Server" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Second Server/ })).not.toBeInTheDocument();
    expect(screen.queryByText("2 server connected")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Set Current" }));

    expect(window.localStorage.getItem("lumi.selectedServerId")).toBe("server-2");
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Home" }));
    await waitFor(() =>
      expect(getPosterCardButtonsByName(/Second Server Movie/)).toHaveLength(2),
    );
    expect(await screen.findByRole("button", { name: "Kids" })).toBeInTheDocument();
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("providers_list_libraries", {
        request: { serverId: "server-2" },
      }),
    );
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("media_get_home_rows", {
        request: {
          continueWatchingLimit: 10,
          latestLimit: 10,
          libraryIds: ["library-3"],
          serverId: "server-2",
        },
      }),
    );
  });

  it("falls back when the persisted selected server no longer exists", async () => {
    window.localStorage.setItem("lumi.selectedServerId", "missing-server");
    mockBrowsingCommands();

    render(<App />);

    await screen.findByRole("button", { name: /Demo Movie/ });

    expect(window.localStorage.getItem("lumi.selectedServerId")).toBe("server-1");
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("providers_list_libraries", {
        request: { serverId: "server-1" },
      }),
    );
  });

  it("does not render development-phase placeholder copy in browsing surfaces", async () => {
    const user = userEvent.setup();
    mockBrowsingCommands();

    render(<App />);

    await screen.findByRole("button", { name: /Demo Movie/ });

    expect(screen.queryByText(/P6|P7|arrives/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Demo Movie/ }));
    expect(await screen.findByRole("heading", { name: "Demo Movie" })).toBeInTheDocument();
    expect(screen.queryByText(/P6|P7|arrives/i)).not.toBeInTheDocument();
  });

  it("keeps primary workbench page titles accessible without visible page headers", async () => {
    const user = userEvent.setup();
    mockBrowsingCommands();

    render(<App />);

    await screen.findByRole("button", { name: /Demo Movie/ });
    expect(await screen.findByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(document.querySelector(".home-view .workbench-header")).not.toBeInTheDocument();
    expect(document.querySelector(".home-view .cinematic-hero")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Favorites" }));
    expect(await screen.findByRole("heading", { name: "Favorites" })).toBeInTheDocument();
    expect(document.querySelector(".favorites-view .workbench-header")).not.toBeInTheDocument();
    expect(document.querySelector(".favorites-view .cinematic-hero")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByRole("heading", { name: "Search" })).toBeInTheDocument();
    expect(document.querySelector(".search-view .workbench-header")).not.toBeInTheDocument();
    expect(document.querySelector(".search-view .cinematic-hero")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(document.querySelector(".settings-view .workbench-header")).not.toBeInTheDocument();
    expect(document.querySelector(".settings-view .cinematic-hero")).not.toBeInTheDocument();
  });

  it("keeps playable media action available when sources are not preloaded", async () => {
    const user = userEvent.setup();
    mockBrowsingCommands();
    invokeMock.mockImplementation((command: string, args?: unknown) => {
      const request = (args as CommandArgs | undefined)?.request;

      if (command === "media_get_item" && request?.itemId === "movie-1") {
        return Promise.resolve({
          item: demoMovie,
          mediaSources: [],
        });
      }

      return mockBrowsingCommandsFallback(command, args);
    });

    render(<App />);

    await user.click(await screen.findByRole("button", { name: /Demo Movie/ }));

    expect(await screen.findByRole("button", { name: "Play" })).toBeEnabled();
    expect(await screen.findByText("A mapped movie.")).toBeInTheDocument();
    expect(await screen.findByText("Source resolves on play")).toBeInTheDocument();

    const play = screen.getByRole("button", { name: "Play" });
    expect(play).toBeEnabled();
    await user.click(play);

    expect(await screen.findByText("Opening")).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledWith("playback_open", {
      request: {
        serverId: "server-1",
        itemId: "movie-1",
        mediaSourceId: null,
      },
    });
    expect(screen.queryByText("Could not load media details")).not.toBeInTheDocument();
  });

  it("opens container playback by passing the container item to Rust", async () => {
    const user = userEvent.setup();
    mockBrowsingCommands();
    invokeMock.mockImplementation((command: string, args?: unknown) => {
      const request = (args as CommandArgs | undefined)?.request;

      if (command === "media_get_home_rows") {
        return Promise.resolve({
          continueWatching: [nestedFolder],
          latestByLibrary: [],
        });
      }

      if (command === "media_list_children" && request?.parentId === "library-1") {
        return Promise.resolve({
          items: [nestedFolder],
          nextCursor: null,
        });
      }

      return mockBrowsingCommandsFallback(command, args);
    });

    render(<App />);

    await user.click(await findPosterCardButtonByName(/Movie Folder/));

    expect(await screen.findByRole("heading", { name: "Movie Folder" })).toBeInTheDocument();
    expect(await screen.findByText("Plays first available item")).toBeInTheDocument();

    const play = screen.getByRole("button", { name: "Play" });
    expect(play).toBeEnabled();
    await user.click(play);

    expect(invokeMock).toHaveBeenCalledWith("playback_open", {
      request: {
        serverId: "server-1",
        itemId: "folder-1",
        mediaSourceId: null,
      },
    });
  });

  it("enables playback for standalone video items", async () => {
    const user = userEvent.setup();
    mockBrowsingCommands();
    invokeMock.mockImplementation((command: string, args?: unknown) => {
      const request = (args as CommandArgs | undefined)?.request;

      if (command === "media_get_home_rows") {
        return Promise.resolve({
          continueWatching: [demoVideo],
          latestByLibrary: [],
        });
      }

      if (command === "media_list_children" && request?.parentId === "library-1") {
        return Promise.resolve({
          items: [demoVideo],
          nextCursor: null,
        });
      }

      return mockBrowsingCommandsFallback(command, args);
    });

    render(<App />);

    await user.click(await findPosterCardButtonByName(/Home Video/));

    expect(await screen.findByRole("button", { name: "Play" })).toBeEnabled();
    expect(screen.getByRole("heading", { name: "Home Video" })).toBeInTheDocument();
    expect(screen.getByText("1 source ready")).toBeInTheDocument();
  });

  it("shows playback errors without exposing raw stream URLs or tokens", async () => {
    const user = userEvent.setup();
    mockBrowsingCommands();

    render(<App />);

    await user.click(await screen.findByRole("button", { name: /Demo Movie/ }));
    await user.click(await screen.findByRole("button", { name: "Play" }));

    expect(await screen.findByText("Opening")).toBeInTheDocument();
    emitTauriEvent("playback:error", {
      sessionId: "session-1",
      code: "playback.mpv_library_missing",
      message: "Native mpv library could not be loaded",
      detail: {
        mediaUrl: "http://localhost/stream.mkv?api_key=token-value",
      },
    });

    expect(await screen.findByText("Native mpv library could not be loaded")).toBeInTheDocument();
    expect(screen.getByText("playback.mpv_library_missing")).toBeInTheDocument();
    expect(screen.queryByText(/api_key=token-value/)).not.toBeInTheDocument();
  });

  it("opens a library, renders its children, and navigates to media detail", async () => {
    const user = userEvent.setup();
    mockBrowsingCommands();

    render(<App />);

    await user.click(await screen.findByRole("button", { name: /Movies/ }));

    expect(await screen.findByRole("heading", { name: "Movies" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Demo Movie/ })).toBeInTheDocument();
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("media_list_children", {
        request: { serverId: "server-1", parentId: "library-1", cursor: null },
      }),
    );

    await user.click(screen.getByRole("button", { name: /Demo Movie/ }));
    expect(await screen.findByRole("heading", { name: "Demo Movie" })).toBeInTheDocument();
  });

  it("moves Home latest rail focus horizontally and opens detail with Enter", async () => {
    const user = userEvent.setup();
    mockBrowsingCommands();

    render(<App />);

    const second = await screen.findByRole("button", { name: /Second Movie/ });
    const third = await screen.findByRole("button", { name: /Third Movie/ });

    second.focus();
    await user.keyboard("{ArrowRight}");

    expect(third).toHaveFocus();
    expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();

    await user.keyboard("{Enter}");
    expect(await screen.findByRole("heading", { name: "Third Movie" })).toBeInTheDocument();
  });

  it("keeps Home latest rail as a single horizontal row", async () => {
    const user = userEvent.setup();
    mockBrowsingCommands();

    render(<App />);

    const second = await screen.findByRole("button", { name: /Second Movie/ });
    const third = await screen.findByRole("button", { name: /Third Movie/ });
    scrollIntoViewMock.mockClear();

    second.focus();
    await user.keyboard("{ArrowRight}");
    expect(third).toHaveFocus();
    expect(scrollIntoViewMock).toHaveBeenCalled();

    second.focus();
    await user.keyboard("{ArrowDown}");
    expect(second).toHaveFocus();
  });

  it("moves library grid focus by row and returns to the Home sidebar at the left edge", async () => {
    const user = userEvent.setup();
    mockBrowsingCommands();

    render(<App />);

    await user.click(await screen.findByRole("button", { name: /Movies/ }));
    expect(await screen.findByRole("heading", { name: "Movies" })).toBeInTheDocument();

    const firstMovie = await screen.findByRole("button", { name: /Demo Movie/ });
    const second = await screen.findByRole("button", { name: /Second Movie/ });
    const sixth = await screen.findByRole("button", { name: /Sixth Movie/ });
    const homeNav = screen.getByRole("button", { name: "Home" });
    expect(firstMovie).not.toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(firstMovie).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(second).toHaveFocus();

    firstMovie.focus();
    await user.keyboard("{ArrowDown}");
    expect(sixth).toHaveFocus();

    await user.keyboard("{ArrowUp}");
    expect(firstMovie).toHaveFocus();

    await user.keyboard("{ArrowLeft}");
    expect(homeNav).toHaveFocus();
  });

  it("navigates series to season to episode from media detail children", async () => {
    const user = userEvent.setup();
    mockBrowsingCommands();

    render(<App />);

    await user.click(await screen.findByRole("button", { name: /TV Shows/ }));
    await user.click(await screen.findByRole("button", { name: /Demo Series/ }));

    expect(await screen.findByRole("heading", { name: "Demo Series" })).toBeInTheDocument();
    const season = await screen.findByRole("button", { name: /Season 1/ });
    expect(season).not.toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(season).toHaveFocus();

    await user.keyboard("{Enter}");

    expect(await screen.findByRole("heading", { name: "Season 1" })).toBeInTheDocument();
    const episode = await screen.findByRole("button", { name: /Episode 1/ });
    await user.keyboard("{ArrowDown}");
    expect(episode).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("heading", { name: "Episode 1" })).toBeInTheDocument();
  });

  it("loads Home rows instead of the first library children on initial render", async () => {
    mockBrowsingCommands();

    render(<App />);

    await screen.findByRole("button", { name: /Demo Movie/ });

    await waitFor(() => {
      const homeRowsRequests = invokeMock.mock.calls.filter(
        ([command]) => command === "media_get_home_rows",
      );
      const childRequests = invokeMock.mock.calls.filter(
        ([command]) => command === "media_list_children",
      );
      expect(homeRowsRequests).toEqual([
        [
          "media_get_home_rows",
          {
            request: {
              continueWatchingLimit: 10,
              latestLimit: 10,
              libraryIds: ["library-1", "library-2"],
              serverId: "server-1",
            },
          },
        ],
      ]);
      expect(childRequests).toEqual([]);
    });
  });

  it("shows empty and failed media states without exposing raw details", async () => {
    const user = userEvent.setup();
    invokeMock.mockImplementation((command: string, args?: unknown) => {
      const request = (args as CommandArgs | undefined)?.request;

      if (command === "settings_get") {
        return Promise.resolve({
          theme: "system",
          materialEffectsEnabled: true,
        });
      }
      if (command === "providers_list_servers") {
        return Promise.resolve([demoServer]);
      }
      if (command === "providers_list_libraries") {
        return Promise.resolve([tvLibrary, moviesLibrary]);
      }
      if (command === "media_list_children") {
        return Promise.resolve({
          items: request?.parentId === "library-1" ? [demoMovie] : [],
          nextCursor: null,
        });
      }
      if (command === "media_get_item") {
        return Promise.reject({
          code: "emby.server",
          message: "Emby request failed",
          recoverable: true,
          detail: { body: "raw server detail" },
        });
      }
      return Promise.resolve(null);
    });

    render(<App />);

    await user.click(await screen.findByRole("button", { name: /TV Shows/ }));
    expect(await screen.findByText("No media found")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to Home" }));
    await user.click(await screen.findByRole("button", { name: /Movies/ }));
    await user.click(await screen.findByRole("button", { name: /Demo Movie/ }));

    expect(await screen.findByText("Could not load media details")).toBeInTheDocument();
    expect(screen.queryByText("raw server detail")).not.toBeInTheDocument();
  });

  it("logs into an Emby server from Settings and returns focus after closing", async () => {
    const user = userEvent.setup();
    invokeMock.mockImplementation((command: string) => {
      if (command === "settings_get") {
        return Promise.resolve({
          theme: "system",
          materialEffectsEnabled: true,
        });
      }
      if (command === "providers_list_servers") {
        return Promise.resolve([]);
      }
      if (command === "auth_login_manual") {
        return Promise.resolve(demoServer);
      }
      return Promise.resolve([]);
    });

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    const addServer = screen.getByRole("button", { name: "Add Server" });
    await user.click(addServer);

    const dialog = await screen.findByRole("dialog", { name: "Add Emby Server" });
    const urlInput = within(dialog).getByLabelText("Server URL");
    expect(urlInput).toHaveFocus();

    await user.type(urlInput, "http://localhost:8096");
    await user.type(within(dialog).getByLabelText("Server name"), "Living Room");
    await user.type(within(dialog).getByLabelText("Username"), "demo");
    await user.type(within(dialog).getByLabelText("Password"), "secret");
    await user.click(within(dialog).getByRole("button", { name: "Connect" }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("auth_login_manual", {
        request: {
          baseUrl: "http://localhost:8096",
          displayName: "Living Room",
          username: "demo",
          password: "secret",
        },
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Add Emby Server" })).not.toBeInTheDocument(),
    );
    expect(addServer).toHaveFocus();
  });

  it("does not let directional focus handlers take over dialog or search inputs", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Search" }));
    expect(await screen.findByRole("heading", { name: "Search" })).toBeInTheDocument();
    const searchInput = screen.getByLabelText("Search media");
    searchInput.focus();
    scrollIntoViewMock.mockClear();

    await user.keyboard("{ArrowRight}");
    expect(searchInput).toHaveFocus();
    expect(scrollIntoViewMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add Server" }));

    const dialog = await screen.findByRole("dialog", { name: "Add Emby Server" });
    const urlInput = within(dialog).getByLabelText("Server URL");
    scrollIntoViewMock.mockClear();

    await user.keyboard("{ArrowDown}");
    expect(urlInput).toHaveFocus();
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it("allows submitting an Emby login with an empty password", async () => {
    const user = userEvent.setup();
    invokeMock.mockImplementation((command: string) => {
      if (command === "settings_get") {
        return Promise.resolve({
          theme: "system",
          materialEffectsEnabled: true,
        });
      }
      if (command === "providers_list_servers") {
        return Promise.resolve([]);
      }
      if (command === "auth_login_manual") {
        return Promise.resolve(demoServer);
      }
      return Promise.resolve([]);
    });

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add Server" }));

    const dialog = await screen.findByRole("dialog", { name: "Add Emby Server" });
    await user.type(within(dialog).getByLabelText("Server URL"), "http://localhost:8096");
    await user.type(within(dialog).getByLabelText("Username"), "demo");
    await user.click(within(dialog).getByRole("button", { name: "Connect" }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("auth_login_manual", {
        request: {
          baseUrl: "http://localhost:8096",
          username: "demo",
          password: "",
        },
      }),
    );
  });

  it("keeps login input values visible when login fails", async () => {
    const user = userEvent.setup();
    invokeMock.mockImplementation((command: string) => {
      if (command === "settings_get") {
        return Promise.resolve({
          theme: "system",
          materialEffectsEnabled: true,
        });
      }
      if (command === "providers_list_servers") {
        return Promise.resolve([]);
      }
      if (command === "auth_login_manual") {
        return Promise.reject({
          code: "emby.auth.invalid_credentials",
          message: "Invalid username or password",
          recoverable: true,
        });
      }
      return Promise.resolve([]);
    });

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add Server" }));

    const dialog = await screen.findByRole("dialog", { name: "Add Emby Server" });
    const urlInput = within(dialog).getByLabelText("Server URL");
    const usernameInput = within(dialog).getByLabelText("Username");
    const passwordInput = within(dialog).getByLabelText("Password");
    await user.type(urlInput, "http://localhost:8096");
    await user.type(usernameInput, "demo");
    await user.type(passwordInput, "wrong");
    await user.click(within(dialog).getByRole("button", { name: "Connect" }));

    expect(await within(dialog).findByText("Invalid username or password")).toBeInTheDocument();
    expect(within(dialog).getByText("emby.auth.invalid_credentials")).toBeInTheDocument();
    expect(urlInput).toHaveValue("http://localhost:8096");
    expect(usernameInput).toHaveValue("demo");
    expect(passwordInput).toHaveValue("wrong");
  });
});

function emitTauriEvent(event: string, payload: unknown) {
  const listeners = eventListeners.get(event);
  if (!listeners) {
    return;
  }
  for (const listener of listeners) {
    listener({ payload });
  }
}

function installIntersectionObserverMock() {
  let callback:
    | ((
        entries: Array<{
          isIntersecting: boolean;
          target: Element;
        }>,
      ) => void)
    | null = null;
  let target: Element | null = null;

  class IntersectionObserverMock {
    constructor(
      observerCallback: (
        entries: Array<{
          isIntersecting: boolean;
          target: Element;
        }>,
      ) => void,
    ) {
      callback = observerCallback;
    }

    disconnect() {}

    observe(nextTarget: Element) {
      target = nextTarget;
    }

    unobserve() {}
  }

  Object.defineProperty(window, "IntersectionObserver", {
    configurable: true,
    value: IntersectionObserverMock,
    writable: true,
  });
  Object.defineProperty(globalThis, "IntersectionObserver", {
    configurable: true,
    value: IntersectionObserverMock,
    writable: true,
  });

  return {
    emit(isIntersecting: boolean) {
      if (callback && target) {
        callback([{ isIntersecting, target }]);
      }
    },
  };
}
