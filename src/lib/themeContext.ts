import { createContext } from "react";
import type { ThemePreference } from "./tauriClient";
import type { ResolvedTheme } from "./themeCore";

export type ThemeContextValue = {
  resolvedTheme: ResolvedTheme;
  setThemePreference: (themePreference: ThemePreference) => void;
  themePreference: ThemePreference;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);
