import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { setTheme } from "@tauri-apps/api/app";
import { ThemeContext } from "./themeContext";
import {
  darkModeMediaQuery,
  getSystemPrefersDark,
  readThemePreference,
  resolveTheme,
  writeThemePreference,
} from "./themeCore";
import {
  useSettings,
  useUpdateSettings,
  type ThemePreference,
} from "./tauriClient";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themePreference, setThemePreferenceState] =
    useState<ThemePreference>(readThemePreference);
  const [prefersDark, setPrefersDark] = useState(getSystemPrefersDark);
  const settings = useSettings();
  const updateSettings = useUpdateSettings();
  const resolvedTheme = resolveTheme(themePreference, prefersDark);

  useEffect(() => {
    if (settings.data?.theme) {
      setThemePreferenceState(settings.data.theme);
      writeThemePreference(settings.data.theme);
    }
  }, [settings.data?.theme]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia(darkModeMediaQuery);
    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersDark(event.matches);
    };

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolvedTheme;
    root.dataset.themePreference = themePreference;
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme, themePreference]);

  useEffect(() => {
    void setTheme(resolvedTheme).catch(() => {
      // Native theme sync is best-effort; CSS theme state remains authoritative.
    });
  }, [resolvedTheme]);

  const setThemePreference = useCallback(
    (nextPreference: ThemePreference) => {
      setThemePreferenceState(nextPreference);
      writeThemePreference(nextPreference);
      updateSettings.mutate(
        { theme: nextPreference },
        {
          onSuccess: (updated) => {
            setThemePreferenceState(updated.theme);
            writeThemePreference(updated.theme);
          },
        },
      );
    },
    [updateSettings],
  );

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
