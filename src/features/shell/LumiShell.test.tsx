import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import App from "../../App";
import type { LibraryItem, LibraryItemDetail, ServerProfile } from "../../lib/tauriClient";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
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
    mediaSourceId?: string | null;
    parentId?: string | null;
    serverId?: string;
    sessionId?: string;
  };
};

function itemDetail(item: LibraryItem): LibraryItemDetail {
  return {
    item,
    mediaSources: item.itemType === "movie" || item.itemType === "episode"
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
  if (command === "media_list_children") {
    const parentId = request?.parentId;
    const itemsByParent: Record<string, LibraryItem[]> = {
      "library-1": [demoMovie, secondMovie, thirdMovie, fourthMovie],
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

  it("renders product navigation and removes bootstrap copy", async () => {
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Libraries" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();

    expect(screen.queryByText("Emby-first provider")).not.toBeInTheDocument();
    expect(screen.queryByText("Native mpv playback")).not.toBeInTheDocument();
    expect(screen.queryByText("System material shell")).not.toBeInTheDocument();
  });

  it("switches navigation with pointer and vertical arrow-key focus", async () => {
    const user = userEvent.setup();
    render(<App />);

    const libraries = await screen.findByRole("button", { name: "Libraries" });
    await user.click(libraries);
    expect(screen.getByRole("heading", { name: "Libraries" })).toBeInTheDocument();

    const home = screen.getByRole("button", { name: "Home" });
    home.focus();
    await user.keyboard("{ArrowDown}");

    expect(libraries).toHaveFocus();
    expect(screen.getByRole("heading", { name: "Libraries" })).toBeInTheDocument();

    await user.keyboard("{ArrowUp}");

    expect(home).toHaveFocus();
    expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();
  });

  it("uses view transitions for primary route changes when available", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Settings" }));

    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(startViewTransitionMock).toHaveBeenCalled();
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

  it("renders Home media rails from provider DTOs and opens media detail", async () => {
    const user = userEvent.setup();
    mockBrowsingCommands();

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Latest" })).toBeInTheDocument();
    await screen.findByRole("button", { name: /Demo Movie/ });
    expect(screen.getAllByText("No artwork").length).toBeGreaterThan(0);

    await user.click(await screen.findByRole("button", { name: /Demo Movie/ }));

    expect(await screen.findByRole("heading", { name: "Demo Movie" })).toBeInTheDocument();
    const play = screen.getByRole("button", { name: "Play" });
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

    expect(await screen.findByRole("heading", { name: "Demo Movie" })).toBeInTheDocument();
    expect(screen.getByText("A mapped movie.")).toBeInTheDocument();
    expect(screen.getByText("Source resolves on play")).toBeInTheDocument();

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

    await user.click(await screen.findByRole("button", { name: "Libraries" }));
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

  it("moves Home media-card focus from the rail with arrow keys and opens detail with Enter", async () => {
    const user = userEvent.setup();
    mockBrowsingCommands();

    render(<App />);

    const firstMovie = await screen.findByRole("button", { name: /Demo Movie/ });
    const second = await screen.findByRole("button", { name: /Second Movie/ });

    expect(firstMovie).not.toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(firstMovie).toHaveFocus();

    await user.keyboard("{ArrowRight}");

    expect(second).toHaveFocus();
    expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();

    await user.keyboard("{Enter}");
    expect(await screen.findByRole("heading", { name: "Second Movie" })).toBeInTheDocument();
  });

  it("moves Home media-card focus as a 3-column grid and scrolls focused cards into view", async () => {
    const user = userEvent.setup();
    mockBrowsingCommands();

    render(<App />);

    const firstMovie = await screen.findByRole("button", { name: /Demo Movie/ });
    const second = await screen.findByRole("button", { name: /Second Movie/ });
    const fourth = await screen.findByRole("button", { name: /Fourth Movie/ });
    scrollIntoViewMock.mockClear();

    firstMovie.focus();
    await user.keyboard("{ArrowRight}");
    expect(second).toHaveFocus();

    firstMovie.focus();
    await user.keyboard("{ArrowDown}");
    expect(fourth).toHaveFocus();
    expect(scrollIntoViewMock).toHaveBeenCalled();

    second.focus();
    await user.keyboard("{ArrowDown}");
    expect(second).toHaveFocus();
  });

  it("moves Libraries grid focus by row and returns to the active sidebar at the left edge", async () => {
    const user = userEvent.setup();
    mockBrowsingCommands();

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Libraries" }));
    await user.click(await screen.findByRole("button", { name: /Movies/ }));

    const firstMovie = await screen.findByRole("button", { name: /Demo Movie/ });
    const second = await screen.findByRole("button", { name: /Second Movie/ });
    const fourth = await screen.findByRole("button", { name: /Fourth Movie/ });
    const librariesNav = screen.getByRole("button", { name: "Libraries" });
    expect(firstMovie).not.toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(firstMovie).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(second).toHaveFocus();

    firstMovie.focus();
    await user.keyboard("{ArrowDown}");
    expect(fourth).toHaveFocus();

    await user.keyboard("{ArrowUp}");
    expect(firstMovie).toHaveFocus();

    await user.keyboard("{ArrowLeft}");
    expect(librariesNav).toHaveFocus();
  });

  it("navigates series to season to episode from media detail children", async () => {
    const user = userEvent.setup();
    mockBrowsingCommands();

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Libraries" }));
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

  it("only loads the first Home library on initial render", async () => {
    mockBrowsingCommands();

    render(<App />);

    await screen.findByRole("button", { name: /Demo Movie/ });

    await waitFor(() => {
      const childRequests = invokeMock.mock.calls.filter(
        ([command]) => command === "media_list_children",
      );
      expect(childRequests).toEqual([
        [
          "media_list_children",
          { request: { serverId: "server-1", parentId: "library-1", cursor: null } },
        ],
      ]);
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

    await user.click(await screen.findByRole("button", { name: "Libraries" }));
    await user.click(await screen.findByRole("button", { name: /TV Shows/ }));
    expect(await screen.findByText("No media found")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to Libraries" }));
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
    const searchInput = screen.getByLabelText("Search media");
    searchInput.focus();
    scrollIntoViewMock.mockClear();

    await user.keyboard("{ArrowRight}");
    expect(searchInput).toHaveFocus();
    expect(scrollIntoViewMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Settings" }));
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
