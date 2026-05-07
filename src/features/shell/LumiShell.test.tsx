import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import type { LibraryItem, LibraryItemDetail, ServerProfile } from "../../lib/tauriClient";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

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
    itemId?: string;
    parentId?: string | null;
    serverId?: string;
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
      return Promise.resolve([moviesLibrary, tvLibrary]);
    }
    if (command === "media_list_children") {
      const parentId = request?.parentId;
      const itemsByParent: Record<string, LibraryItem[]> = {
        "library-1": [demoMovie, secondMovie],
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
    return Promise.resolve(null);
  });
}

describe("LumiShell", () => {
  beforeEach(() => {
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

  it("switches navigation with pointer and arrow-key focus", async () => {
    const user = userEvent.setup();
    render(<App />);

    const libraries = await screen.findByRole("button", { name: "Libraries" });
    await user.click(libraries);
    expect(screen.getByRole("heading", { name: "Libraries" })).toBeInTheDocument();

    const home = screen.getByRole("button", { name: "Home" });
    home.focus();
    await user.keyboard("{ArrowRight}");

    expect(libraries).toHaveFocus();
    expect(screen.getByRole("heading", { name: "Libraries" })).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("media_get_item", {
        request: { serverId: "server-1", itemId: "movie-1" },
      }),
    );
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

  it("moves Libraries grid focus from the page with arrow keys and opens detail with Enter", async () => {
    const user = userEvent.setup();
    mockBrowsingCommands();

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Libraries" }));
    await user.click(await screen.findByRole("button", { name: /Movies/ }));

    const firstMovie = await screen.findByRole("button", { name: /Demo Movie/ });
    const second = await screen.findByRole("button", { name: /Second Movie/ });
    expect(firstMovie).not.toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(firstMovie).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(second).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(await screen.findByRole("heading", { name: "Second Movie" })).toBeInTheDocument();
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
