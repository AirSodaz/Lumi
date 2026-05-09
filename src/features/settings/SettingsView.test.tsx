import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Tooltip from "@radix-ui/react-tooltip";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { I18nProvider, languagePreferenceStorageKey } from "../../lib/i18n";
import { ThemeProvider, themePreferenceStorageKey } from "../../lib/theme";
import { SettingsView } from "./SettingsView";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

const demoServer = {
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
    {
      id: "line-2",
      serverId: "server-1",
      name: "Remote",
      baseUrl: "https://remote.example.com/emby",
      isActive: false,
      createdAt: "2026-05-08T00:00:00Z",
      updatedAt: "2026-05-08T00:00:00Z",
    },
  ],
  userId: "user-1",
  createdAt: "2026-05-07T00:00:00Z",
  updatedAt: "2026-05-07T00:00:00Z",
};

const secondServer = {
  id: "server-2",
  providerKind: "emby",
  name: "Second Server",
  baseUrl: "http://localhost:8097",
  lines: [
    {
      id: "line-3",
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

function serverWithLines(
  patch: Partial<typeof demoServer> & { lines?: typeof demoServer.lines },
) {
  return { ...demoServer, ...patch };
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <ThemeProvider>
      <I18nProvider>
        <QueryClientProvider client={client}>
          <Tooltip.Provider>{children}</Tooltip.Provider>
        </QueryClientProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}

function renderSettingsView(
  props: {
    onSelectServer?: (serverId: string) => void;
    selectedServerId?: string | null;
  } = {},
) {
  const onSelectServer = props.onSelectServer ?? vi.fn();

  render(
    <SettingsView
      onSelectServer={onSelectServer}
      selectedServerId={props.selectedServerId ?? "server-1"}
    />,
    { wrapper },
  );

  return { onSelectServer };
}

describe("SettingsView", () => {
  beforeEach(() => {
    window.localStorage.clear();
    invokeMock.mockReset();
    invokeMock.mockImplementation((command: string, args?: unknown) => {
      if (command === "providers_list_servers") {
        return Promise.resolve([demoServer]);
      }
      if (command === "settings_get") {
        return Promise.resolve({
          materialEffectsEnabled: true,
          player: {
            defaultVolume: 80,
            subtitlePreference: "serverDefault",
          },
          theme: "system",
        });
      }
      if (command === "settings_update") {
        return Promise.resolve({
          materialEffectsEnabled: true,
          player: {
            defaultVolume:
              (args as { patch?: { defaultVolume?: number } } | undefined)?.patch
                ?.defaultVolume ?? 80,
            subtitlePreference: "serverDefault",
          },
          theme: "system",
        });
      }
      if (command === "settings_get_material_state") {
        return Promise.resolve({
          kind: "fallbackSurface",
          reason: "Native material probing is not implemented in this build",
          status: "fallback",
        });
      }
      if (command === "settings_diagnose_mpv") {
        return Promise.resolve({
          message: "Native mpv backend is ready",
          status: "available",
        });
      }
      if (command === "settings_export_logs") {
        return Promise.resolve({
          contents: "Lumi diagnostics export\nserver: server-1 Demo Server",
          fileName: "lumi-logs-2026-05-08.txt",
        });
      }
      if (command === "auth_logout") {
        return Promise.resolve(null);
      }
      if (command === "providers_update_server_profile") {
        return Promise.resolve({
          ...demoServer,
          name:
            (args as { request?: { name?: string } } | undefined)?.request?.name ??
            demoServer.name,
          updatedAt: "2026-05-08T00:00:00Z",
        });
      }
      if (command === "providers_create_server_line") {
        return Promise.resolve(
          serverWithLines({
            lines: [
              ...demoServer.lines,
              {
                id: "line-3",
                serverId: "server-1",
                name:
                  (args as { request?: { name?: string } } | undefined)?.request?.name ??
                  "Remote 2",
                baseUrl:
                  (args as { request?: { baseUrl?: string } } | undefined)?.request
                    ?.baseUrl ?? "https://remote2.example.com/emby",
                isActive: false,
                createdAt: "2026-05-08T00:01:00Z",
                updatedAt: "2026-05-08T00:01:00Z",
              },
            ],
            updatedAt: "2026-05-08T00:01:00Z",
          }),
        );
      }
      if (command === "providers_select_server_line") {
        return Promise.resolve(
          serverWithLines({
            baseUrl: "https://remote.example.com/emby",
            lines: demoServer.lines.map((line) => ({
              ...line,
              isActive: line.id === "line-2",
            })),
            updatedAt: "2026-05-08T00:02:00Z",
          }),
        );
      }
      if (command === "providers_update_server_line") {
        return Promise.resolve(
          serverWithLines({
            baseUrl: "https://remote.example.com/emby",
            lines: demoServer.lines.map((line) =>
              line.id === "line-2"
                ? {
                    ...line,
                    name:
                      (args as { request?: { name?: string } } | undefined)?.request
                        ?.name ?? "Remote 2",
                    baseUrl:
                      (args as { request?: { baseUrl?: string } } | undefined)
                        ?.request?.baseUrl ?? line.baseUrl,
                  }
                : line,
            ),
            updatedAt: "2026-05-08T00:03:00Z",
          }),
        );
      }
      if (command === "providers_delete_server_line") {
        return Promise.resolve(
          serverWithLines({
            lines: demoServer.lines.filter((line) => line.id !== "line-2"),
            updatedAt: "2026-05-08T00:04:00Z",
          }),
        );
      }
      return Promise.resolve(null);
    });
  });

  it("logs out and removes a saved server from the settings list", async () => {
    const user = userEvent.setup();
    renderSettingsView();

    const serverRow = await screen.findByText("Demo Server");
    expect(serverRow).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "More actions for Demo Server" }));
    await user.click(await screen.findByRole("menuitem", { name: "Sign out" }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("auth_logout", {
        request: { serverId: "server-1" },
      }),
    );
  });

  it("opens saved server details from the server menu", async () => {
    const user = userEvent.setup();
    renderSettingsView();

    await screen.findByText("Demo Server");
    await user.click(screen.getByRole("button", { name: "More actions for Demo Server" }));
    await user.click(await screen.findByRole("menuitem", { name: "View Server" }));

    const dialog = await screen.findByRole("dialog", { name: "Demo Server" });
    expect(within(dialog).getAllByText("http://localhost:8096")).toHaveLength(2);
    expect(within(dialog).getByText("Remote")).toBeInTheDocument();
    expect(within(dialog).getByText("https://remote.example.com/emby")).toBeInTheDocument();
    expect(within(dialog).getByText("user-1")).toBeInTheDocument();
  });

  it("manages server lines from the server detail dialog", async () => {
    const user = userEvent.setup();
    renderSettingsView();

    await screen.findByText("Demo Server");
    expect(screen.getByText("2 lines")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "More actions for Demo Server" }));
    await user.click(await screen.findByRole("menuitem", { name: "View Server" }));

    const dialog = await screen.findByRole("dialog", { name: "Demo Server" });
    await user.click(within(dialog).getByRole("button", { name: "Use line Remote" }));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("providers_select_server_line", {
        request: { serverId: "server-1", lineId: "line-2" },
      }),
    );

    await user.click(within(dialog).getByRole("button", { name: "Edit line Remote" }));
    const nameInput = within(dialog).getByLabelText("Line name");
    const urlInput = within(dialog).getByLabelText("Line URL");
    await user.clear(nameInput);
    await user.type(nameInput, "Remote 2");
    await user.clear(urlInput);
    await user.type(urlInput, "https://remote2.example.com/emby");
    await user.click(within(dialog).getByRole("button", { name: "Save line" }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("providers_update_server_line", {
        request: {
          serverId: "server-1",
          lineId: "line-2",
          name: "Remote 2",
          baseUrl: "https://remote2.example.com/emby",
        },
      }),
    );

    await user.click(within(dialog).getByRole("button", { name: "Add line" }));
    await user.type(within(dialog).getByLabelText("Line name"), "Backup");
    await user.type(within(dialog).getByLabelText("Line URL"), "https://backup.example.com");
    await user.click(within(dialog).getByRole("button", { name: "Create line" }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("providers_create_server_line", {
        request: {
          serverId: "server-1",
          name: "Backup",
          baseUrl: "https://backup.example.com",
        },
      }),
    );

    await user.click(within(dialog).getByRole("button", { name: "Delete line Remote" }));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("providers_delete_server_line", {
        request: { serverId: "server-1", lineId: "line-2" },
      }),
    );
  });

  it("renames a saved server from the server menu", async () => {
    const user = userEvent.setup();
    renderSettingsView();

    await screen.findByText("Demo Server");
    await user.click(screen.getByRole("button", { name: "More actions for Demo Server" }));
    await user.click(await screen.findByRole("menuitem", { name: "Rename" }));

    const dialog = await screen.findByRole("dialog", { name: "Rename Server" });
    const nameInput = within(dialog).getByLabelText("Server name");
    await user.clear(nameInput);
    await user.type(nameInput, "Living Room");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("providers_update_server_profile", {
        request: { serverId: "server-1", name: "Living Room" },
      }),
    );
  });

  it("saves player preferences and shows mpv diagnostics", async () => {
    const user = userEvent.setup();
    renderSettingsView();

    await user.click(await screen.findByRole("button", { name: "Player" }));
    expect(await screen.findByText("Native mpv backend is ready")).toBeInTheDocument();

    const volume = screen.getByLabelText("Default volume");
    expect(volume).toHaveValue(80);
    await user.clear(volume);
    await user.type(volume, "72");
    await user.tab();

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("settings_update", {
        patch: { defaultVolume: 72 },
      }),
    );
  });

  it("shows material fallback state and exports redacted logs", async () => {
    const user = userEvent.setup();
    renderSettingsView();

    await user.click(await screen.findByRole("button", { name: "Appearance" }));
    expect(await screen.findByText("Fallback surface")).toBeInTheDocument();
    expect(
      await screen.findByText("Native material probing is not implemented in this build"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Logs" }));
    await user.click(await screen.findByRole("button", { name: "Export logs" }));

    const exportPanel = await screen.findByLabelText("Exported logs");
    expect(within(exportPanel).getByText("lumi-logs-2026-05-08.txt")).toBeInTheDocument();
    expect(within(exportPanel).getByText(/server: server-1 Demo Server/)).toBeInTheDocument();
    expect(exportPanel).not.toHaveTextContent("token-value");
  });

  it("switches interface language locally without updating backend settings", async () => {
    const user = userEvent.setup();
    renderSettingsView();

    await user.click(await screen.findByRole("button", { name: "Appearance" }));
    await screen.findByRole("heading", { name: "Appearance", level: 2 });
    const settingsUpdateCallsBefore = invokeMock.mock.calls.filter(
      ([command]) => command === "settings_update",
    );

    await user.selectOptions(screen.getByLabelText("Language"), "zh");

    expect(window.localStorage.getItem(languagePreferenceStorageKey)).toBe("zh");
    expect(await screen.findByRole("heading", { name: "设置" })).toBeInTheDocument();
    expect(screen.getByLabelText("语言")).toHaveValue("zh");
    expect(document.documentElement).toHaveAttribute("lang", "zh-CN");
    expect(
      invokeMock.mock.calls.filter(([command]) => command === "settings_update"),
    ).toHaveLength(settingsUpdateCallsBefore.length);
  });

  it("switches theme locally without updating backend settings", async () => {
    const user = userEvent.setup();
    renderSettingsView();

    await user.click(await screen.findByRole("button", { name: "Appearance" }));
    await screen.findByRole("heading", { name: "Appearance", level: 2 });
    const settingsUpdateCallsBefore = invokeMock.mock.calls.filter(
      ([command]) => command === "settings_update",
    );

    await user.selectOptions(screen.getByLabelText("Theme"), "light");

    expect(window.localStorage.getItem(themePreferenceStorageKey)).toBe("light");
    expect(screen.getByLabelText("Theme")).toHaveValue("light");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(document.documentElement).toHaveAttribute("data-theme-preference", "light");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(
      invokeMock.mock.calls.filter(([command]) => command === "settings_update"),
    ).toHaveLength(settingsUpdateCallsBefore.length);
  });

  it("switches the current server from the servers list without updating backend settings", async () => {
    const user = userEvent.setup();
    invokeMock.mockImplementation((command: string) => {
      if (command === "providers_list_servers") {
        return Promise.resolve([demoServer, secondServer]);
      }

      if (command === "settings_get") {
        return Promise.resolve({
          materialEffectsEnabled: true,
          player: {
            defaultVolume: 80,
            subtitlePreference: "serverDefault",
          },
          theme: "system",
        });
      }

      if (command === "settings_update") {
        return Promise.resolve({
          materialEffectsEnabled: true,
          player: {
            defaultVolume: 80,
            subtitlePreference: "serverDefault",
          },
          theme: "system",
        });
      }

      return Promise.resolve(null);
    });
    const onSelectServer = vi.fn();

    renderSettingsView({ onSelectServer, selectedServerId: "server-1" });

    expect(await screen.findByText("Demo Server")).toBeInTheDocument();
    expect(screen.getByText("Current server")).toBeInTheDocument();

    const settingsUpdateCallsBefore = invokeMock.mock.calls.filter(
      ([command]) => command === "settings_update",
    );

    await user.click(screen.getByRole("button", { name: "Set Current" }));

    expect(onSelectServer).toHaveBeenCalledWith("server-2");
    expect(
      invokeMock.mock.calls.filter(([command]) => command === "settings_update"),
    ).toHaveLength(settingsUpdateCallsBefore.length);
  });
});
