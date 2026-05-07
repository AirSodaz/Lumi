import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { settings } from "./settings";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

describe("settings client", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("uses the settings_get command", async () => {
    invokeMock.mockResolvedValueOnce({
      theme: "system",
      materialEffectsEnabled: true,
    });

    await expect(settings.get()).resolves.toEqual({
      theme: "system",
      materialEffectsEnabled: true,
    });

    expect(invokeMock).toHaveBeenCalledWith("settings_get");
  });

  it("uses the settings_update command with a patch", async () => {
    invokeMock.mockResolvedValueOnce({
      theme: "dark",
      materialEffectsEnabled: false,
    });

    await expect(
      settings.update({ theme: "dark", materialEffectsEnabled: false }),
    ).resolves.toEqual({
      theme: "dark",
      materialEffectsEnabled: false,
    });

    expect(invokeMock).toHaveBeenCalledWith("settings_update", {
      patch: { theme: "dark", materialEffectsEnabled: false },
    });
  });
});
