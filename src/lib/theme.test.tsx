import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  ThemeProvider,
  readThemePreference,
  resolveTheme,
  themePreferenceStorageKey,
  useTheme,
  writeThemePreference,
  type ThemePreference,
} from "./theme";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

function ThemeProbe() {
  const { resolvedTheme, setThemePreference, themePreference } = useTheme();

  return (
    <div>
      <span data-testid="preference">{themePreference}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button onClick={() => setThemePreference("light")} type="button">
        switch light
      </button>
      <button onClick={() => setThemePreference("system")} type="button">
        switch system
      </button>
    </div>
  );
}

describe("theme", () => {
  afterEach(() => {
    window.localStorage.clear();
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({
      materialEffectsEnabled: true,
      player: {
        defaultVolume: 100,
        subtitlePreference: "serverDefault",
      },
      theme: "system",
    });
    vi.restoreAllMocks();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-theme-preference");
    document.documentElement.style.colorScheme = "";
  });

  it("normalizes invalid stored preferences to system", () => {
    window.localStorage.setItem(themePreferenceStorageKey, "sepia");

    expect(readThemePreference()).toBe("system");
  });

  it("resolves system preference from the current media query", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("persists theme preference locally", () => {
    writeThemePreference("dark" satisfies ThemePreference);

    expect(window.localStorage.getItem(themePreferenceStorageKey)).toBe("dark");
  });

  it("syncs the document theme from backend settings and follows system changes while preference is system", async () => {
    const user = userEvent.setup();
    const mediaQuery = createMatchMedia(false);
    vi.stubGlobal("matchMedia", mediaQuery.matchMedia);
    invokeMock.mockImplementation((command: string, args?: unknown) => {
      if (command === "settings_get") {
        return Promise.resolve({
          materialEffectsEnabled: true,
          player: {
            defaultVolume: 100,
            subtitlePreference: "serverDefault",
          },
          theme: "dark",
        });
      }
      if (command === "settings_update") {
        return Promise.resolve({
          materialEffectsEnabled: true,
          player: {
            defaultVolume: 100,
            subtitlePreference: "serverDefault",
          },
          theme:
            (args as { patch?: { theme?: ThemePreference } } | undefined)?.patch
              ?.theme ?? "system",
        });
      }

      return Promise.resolve(null);
    });

    renderThemeProbe();

    await waitFor(() =>
      expect(screen.getByTestId("preference")).toHaveTextContent("dark"),
    );
    expect(invokeMock).toHaveBeenCalledWith("settings_get");
    expect(screen.getByTestId("preference")).toHaveTextContent("dark");
    expect(screen.getByTestId("resolved")).toHaveTextContent("dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(document.documentElement).toHaveAttribute("data-theme-preference", "dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");

    await user.click(screen.getByRole("button", { name: "switch light" }));

    expect(screen.getByTestId("preference")).toHaveTextContent("light");
    expect(screen.getByTestId("resolved")).toHaveTextContent("light");
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("settings_update", {
        patch: { theme: "light" },
      }),
    );
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(document.documentElement.style.colorScheme).toBe("light");

    await user.click(screen.getByRole("button", { name: "switch system" }));

    expect(screen.getByTestId("preference")).toHaveTextContent("system");
    expect(screen.getByTestId("resolved")).toHaveTextContent("light");
    expect(document.documentElement).toHaveAttribute("data-theme-preference", "system");

    mediaQuery.setMatches(true);

    await waitFor(() =>
      expect(screen.getByTestId("resolved")).toHaveTextContent("dark"),
    );
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });
});

function renderThemeProbe() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

function createMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();

  const queryList = {
    get matches() {
      return matches;
    },
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: (
      _type: string,
      listener: EventListenerOrEventListenerObject | null,
    ) => {
      addMediaQueryListener(listeners, listener);
    },
    removeEventListener: (
      _type: string,
      listener: EventListenerOrEventListenerObject | null,
    ) => {
      removeMediaQueryListener(listeners, listener);
    },
    addListener: (listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeListener: (listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
    dispatchEvent: () => true,
  } satisfies MediaQueryList;

  return {
    matchMedia: () => queryList,
    setMatches(nextMatches: boolean) {
      matches = nextMatches;
      const event = { matches, media: queryList.media } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
  };
}

function addMediaQueryListener(
  listeners: Set<(event: MediaQueryListEvent) => void>,
  listener: EventListenerOrEventListenerObject | null,
) {
  if (typeof listener === "function") {
    listeners.add(listener as (event: MediaQueryListEvent) => void);
  }
}

function removeMediaQueryListener(
  listeners: Set<(event: MediaQueryListEvent) => void>,
  listener: EventListenerOrEventListenerObject | null,
) {
  if (typeof listener === "function") {
    listeners.delete(listener as (event: MediaQueryListEvent) => void);
  }
}
