import type { ThemePreference } from "./tauriClient";

export type ResolvedTheme = "light" | "dark";

export const themePreferenceStorageKey = "lumi.themePreference";
export const darkModeMediaQuery = "(prefers-color-scheme: dark)";

export function resolveTheme(
  themePreference: ThemePreference,
  prefersDark: boolean,
): ResolvedTheme {
  if (themePreference === "dark" || themePreference === "light") {
    return themePreference;
  }

  return prefersDark ? "dark" : "light";
}

export function readThemePreference(): ThemePreference {
  if (typeof window === "undefined") {
    return "system";
  }

  try {
    return normalizeThemePreference(
      window.localStorage.getItem(themePreferenceStorageKey),
    );
  } catch {
    return "system";
  }
}

export function writeThemePreference(themePreference: ThemePreference) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(themePreferenceStorageKey, themePreference);
  } catch {
    // Theme preference is a local convenience setting.
  }
}

export function getSystemPrefersDark() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return true;
  }

  return window.matchMedia(darkModeMediaQuery).matches;
}

function normalizeThemePreference(value: string | null): ThemePreference {
  if (value === "system" || value === "light" || value === "dark") {
    return value;
  }

  return "system";
}
