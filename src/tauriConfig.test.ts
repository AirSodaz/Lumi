import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type TauriWindowConfig = {
  decorations?: boolean;
  titleBarStyle?: string;
  trafficLightPosition?: {
    x: number;
    y: number;
  };
  transparent?: boolean;
  windowEffects?: {
    effects?: string[];
    state?: string;
  };
};

type TauriConfig = {
  app: {
    windows: [TauriWindowConfig, ...TauriWindowConfig[]];
  };
};

const baseConfig = JSON.parse(
  readFileSync("src-tauri/tauri.conf.json", "utf8"),
) as TauriConfig;
const windowsConfig = JSON.parse(
  readFileSync("src-tauri/tauri.windows.conf.json", "utf8"),
) as TauriConfig;

describe("Tauri window material config", () => {
  it("uses native macOS sidebar material in the base desktop window", () => {
    const mainWindow = baseConfig.app.windows[0];

    expect(mainWindow.decorations).toBe(true);
    expect(mainWindow.transparent).toBe(true);
    expect(mainWindow.titleBarStyle).toBe("overlay");
    expect(mainWindow.trafficLightPosition).toEqual({ x: 16, y: 16 });
    expect(mainWindow.windowEffects).toEqual({
      effects: ["sidebar"],
      state: "followsWindowActiveState",
    });
  });

  it("keeps the Windows override on custom chrome with strict Mica effects", () => {
    const mainWindow = windowsConfig.app.windows[0];

    expect(mainWindow.decorations).toBe(false);
    expect(mainWindow.windowEffects).toEqual({
      effects: ["mica"],
      state: "active",
    });
  });
});
