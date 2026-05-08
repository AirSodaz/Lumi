import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import App from "../../App";
import type { LibraryItem, LibraryItemDetail, ServerProfile } from "../../lib/tauriClient";
import { invoke } from "@tauri-apps/api/core";

const windowApiMocks = vi.hoisted(() => ({
  close: vi.fn(),
  minimize: vi.fn(),
  startDragging: vi.fn(),
  toggleMaximize: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => ({
    close: windowApiMocks.close,
    minimize: windowApiMocks.minimize,
    startDragging: windowApiMocks.startDragging,
    toggleMaximize: windowApiMocks.toggleMaximize,
  })),
}));

const invokeMock = vi.mocked(invoke);
let scrollIntoViewMock: Mock;
let startViewTransitionMock: Mock;

const demoServer: ServerProfile = {
  id: "server-1",
  providerKind: "emby",
  name: "Demo Server",
  baseUrl: "http://localhost:8096",
  userId: "user-1",
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
    return Promise.resolve([moviesLibrary, tvLibrary]);
  }
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
      state: "playing",
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

describe("LumiShell", () => {
  beforeEach(() => {
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    });
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

    invokeMock.mockReset();
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

  it("renders Windows chrome without the extra button before Back", async () => {
    render(<App />);

    await screen.findByRole("heading", { name: "Home" });

    const navigation = screen.getByLabelText("Window navigation");
    expect(within(navigation).getAllByRole("button")).toHaveLength(2);
    expect(within(navigation).getByRole("button", { name: "Go back" })).toBeDisabled();
    expect(within(navigation).getByRole("button", { name: "Go forward" })).toBeDisabled();
    expect(within(navigation).queryByRole("button", { name: /sidebar|pane|app menu/i })).not.toBeInTheDocument();
  });

  it("keeps macOS on native window chrome", async () => {
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/605.1.15",
    });

    render(<App />);

    await screen.findByRole("heading", { name: "Home" });

    expect(screen.queryByLabelText("Window navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("menubar", { name: "Application menu" })).not.toBeInTheDocument();
  });

  it("navigates route history from the Windows titlebar", async () => {
    const user = userEvent.setup();
    mockBrowsingCommands();

    render(<App />);

    const back = await screen.findByRole("button", { name: "Go back" });
    const forward = screen.getByRole("button", { name: "Go forward" });
    expect(back).toBeDisabled();
    expect(forward).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "收藏" }));
    expect(await screen.findByRole("heading", { name: "收藏" })).toBeInTheDocument();
    expect(back).toBeEnabled();
    expect(forward).toBeDisabled();

    await user.click(back);
    expect(await screen.findByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(forward).toBeEnabled();

    await user.click(forward);
    expect(await screen.findByRole("heading", { name: "收藏" })).toBeInTheDocument();
  });

  it("opens Windows titlebar menus and calls window controls", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "View" }));
    expect(await screen.findByRole("menuitem", { name: "收藏" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Libraries" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("menuitem", { name: "Search" }));
    expect(await screen.findByRole("heading", { name: "Search" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "File" }));
    expect(await screen.findByRole("menuitem", { name: "Open File" })).toHaveAttribute(
      "data-disabled",
    );
    await user.keyboard("{Escape}");

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
    expect(screen.getByRole("button", { name: "收藏" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Libraries" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();

    expect(screen.queryByText("Emby-first provider")).not.toBeInTheDocument();
    expect(screen.queryByText("Native mpv playback")).not.toBeInTheDocument();
    expect(screen.queryByText("System material shell")).not.toBeInTheDocument();
  });

  it("renders Favorites as an empty shell", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "收藏" }));

    expect(await screen.findByRole("heading", { name: "收藏" })).toBeInTheDocument();
    expect(screen.getByText("暂无收藏")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Libraries" })).not.toBeInTheDocument();
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

    await user.click(await screen.findByRole("button", { name: "收藏" }));
    expect(await screen.findByRole("heading", { name: "收藏" })).toBeInTheDocument();

    const home = screen.getByRole("button", { name: "Home" });
    const favorites = screen.getByRole("button", { name: "收藏" });
    home.focus();
    await user.keyboard("{ArrowDown}");

    expect(favorites).toHaveFocus();
    expect(screen.getByRole("heading", { name: "收藏" })).toBeInTheDocument();
  });

  it("switches navigation with pointer and vertical arrow-key focus", async () => {
    const user = userEvent.setup();
    render(<App />);

    const favorites = await screen.findByRole("button", { name: "收藏" });
    await user.click(favorites);
    expect(await screen.findByRole("heading", { name: "收藏" })).toBeInTheDocument();

    const home = screen.getByRole("button", { name: "Home" });
    home.focus();
    await user.keyboard("{ArrowDown}");

    expect(favorites).toHaveFocus();
    expect(screen.getByRole("heading", { name: "收藏" })).toBeInTheDocument();

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
    expect(await screen.findByText("Playing")).toBeInTheDocument();
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
    expect(await screen.findByRole("button", { name: /Demo Movie/ })).toBeInTheDocument();
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("media_list_children", {
        request: { serverId: "server-1", parentId: "library-1", cursor: null },
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

  it("uses compact app workbench headers for primary views instead of cinematic heroes", async () => {
    const user = userEvent.setup();
    mockBrowsingCommands();

    render(<App />);

    await screen.findByRole("button", { name: /Demo Movie/ });
    expect(document.querySelector(".home-view .cinematic-hero")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "收藏" }));
    expect(await screen.findByRole("heading", { name: "收藏" })).toBeInTheDocument();
    expect(document.querySelector(".favorites-view .cinematic-hero")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByRole("heading", { name: "Search" })).toBeInTheDocument();
    expect(document.querySelector(".search-view .cinematic-hero")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
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

    expect(await screen.findByText("Playing")).toBeInTheDocument();
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

    await user.click(await screen.findByRole("button", { name: /Movie Folder/ }));

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

    await user.click(await screen.findByRole("button", { name: /Home Video/ }));

    expect(await screen.findByRole("button", { name: "Play" })).toBeEnabled();
    expect(screen.getByRole("heading", { name: "Home Video" })).toBeInTheDocument();
    expect(screen.getByText("1 source ready")).toBeInTheDocument();
  });

  it("shows playback errors without exposing raw stream URLs or tokens", async () => {
    const user = userEvent.setup();
    mockBrowsingCommands();
    invokeMock.mockImplementation((command: string, args?: unknown) => {
      if (command === "playback_open") {
        return Promise.reject({
          code: "playback.mpv_library_missing",
          message: "Native mpv library could not be loaded",
          recoverable: true,
          detail: {
            mediaUrl: "http://localhost/stream.mkv?api_key=token-value",
          },
        });
      }

      return mockBrowsingCommandsFallback(command, args);
    });

    render(<App />);

    await user.click(await screen.findByRole("button", { name: /Demo Movie/ }));
    await user.click(await screen.findByRole("button", { name: "Play" }));

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
    await user.type(within(dialog).getByLabelText("Username"), "demo");
    await user.type(within(dialog).getByLabelText("Password"), "secret");
    await user.click(within(dialog).getByRole("button", { name: "Connect" }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("auth_login_manual", {
        request: {
          baseUrl: "http://localhost:8096",
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
