import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ThemeContext } from "./themeContext";
import {
  darkModeMediaQuery,
  getSystemPrefersDark,
  readThemePreference,
  resolveTheme,
  writeThemePreference,
} from "./themeCore";
import type { ThemePreference } from "./tauriClient";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themePreference, setThemePreferenceState] =
    useState<ThemePreference>(readThemePreference);
  const [prefersDark, setPrefersDark] = useState(getSystemPrefersDark);
  const resolvedTheme = resolveTheme(themePreference, prefersDark);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia(darkModeMediaQuery);
    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersDark(event.matches);
    };

    setPrefersDark(mediaQuery.matches);
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolvedTheme;
    root.dataset.themePreference = themePreference;
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme, themePreference]);

  const setThemePreference = useCallback((nextPreference: ThemePreference) => {
    setThemePreferenceState(nextPreference);
    writeThemePreference(nextPreference);
  }, []);

  const value = useMemo(
    () => ({
      resolvedTheme,
      setThemePreference,
      themePreference,
    }),
    [resolvedTheme, setThemePreference, themePreference],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}
