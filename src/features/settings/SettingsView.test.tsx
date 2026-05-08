import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Tooltip from "@radix-ui/react-tooltip";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
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
  userId: "user-1",
  createdAt: "2026-05-07T00:00:00Z",
  updatedAt: "2026-05-07T00:00:00Z",
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <Tooltip.Provider>{children}</Tooltip.Provider>
    </QueryClientProvider>
  );
}

describe("SettingsView", () => {
  beforeEach(() => {
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
      return Promise.resolve(null);
    });
  });

  it("logs out and removes a saved server from the settings list", async () => {
    const user = userEvent.setup();
    render(<SettingsView />, { wrapper });

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
    render(<SettingsView />, { wrapper });

    await screen.findByText("Demo Server");
    await user.click(screen.getByRole("button", { name: "More actions for Demo Server" }));
    await user.click(await screen.findByRole("menuitem", { name: "View Server" }));

    const dialog = await screen.findByRole("dialog", { name: "Demo Server" });
    expect(within(dialog).getByText("http://localhost:8096")).toBeInTheDocument();
    expect(within(dialog).getByText("user-1")).toBeInTheDocument();
  });

  it("renames a saved server from the server menu", async () => {
    const user = userEvent.setup();
    render(<SettingsView />, { wrapper });

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
    render(<SettingsView />, { wrapper });

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
    render(<SettingsView />, { wrapper });

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
});
