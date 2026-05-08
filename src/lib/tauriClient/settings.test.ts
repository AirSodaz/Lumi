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

  it("uses settings diagnostics and export commands", async () => {
    invokeMock
      .mockResolvedValueOnce({
        kind: "fallbackSurface",
        reason: "Native material probing is not implemented in this build",
        status: "fallback",
      })
      .mockResolvedValueOnce({
        message: "Native mpv backend is ready",
        status: "available",
      })
      .mockResolvedValueOnce({
        contents: "Lumi diagnostics export",
        fileName: "lumi-logs-2026-05-08.txt",
      });

    await expect(settings.getMaterialState()).resolves.toEqual({
      kind: "fallbackSurface",
      reason: "Native material probing is not implemented in this build",
      status: "fallback",
    });
    await expect(settings.diagnoseMpv()).resolves.toEqual({
      message: "Native mpv backend is ready",
      status: "available",
    });
    await expect(settings.exportLogs()).resolves.toEqual({
      contents: "Lumi diagnostics export",
      fileName: "lumi-logs-2026-05-08.txt",
    });

    expect(invokeMock).toHaveBeenCalledWith("settings_get_material_state");
    expect(invokeMock).toHaveBeenCalledWith("settings_diagnose_mpv");
    expect(invokeMock).toHaveBeenCalledWith("settings_export_logs");
  });
});
