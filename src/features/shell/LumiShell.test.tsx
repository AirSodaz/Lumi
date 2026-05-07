import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import type { ServerProfile } from "../../lib/tauriClient";
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
    await user.type(urlInput, "http://localhost:8096");
    await user.type(usernameInput, "demo");
    await user.type(within(dialog).getByLabelText("Password"), "wrong");
    await user.click(within(dialog).getByRole("button", { name: "Connect" }));

    expect(await within(dialog).findByText("Invalid username or password")).toBeInTheDocument();
    expect(within(dialog).getByText("emby.auth.invalid_credentials")).toBeInTheDocument();
    expect(urlInput).toHaveValue("http://localhost:8096");
    expect(usernameInput).toHaveValue("demo");
  });
});
