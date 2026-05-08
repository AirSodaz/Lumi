import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { I18nContext } from "./i18nContext";
import {
  readLanguagePreference,
  resolveLocale,
  t,
  writeLanguagePreference,
  type LanguagePreference,
} from "./i18nCore";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [languagePreference, setLanguagePreferenceState] =
    useState<LanguagePreference>(readLanguagePreference);
  const locale = resolveLocale(languagePreference);

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale]);

  const setLanguagePreference = useCallback((nextPreference: LanguagePreference) => {
    setLanguagePreferenceState(nextPreference);
    writeLanguagePreference(nextPreference);
  }, []);

  const translate = useCallback(
    (key: Parameters<typeof t>[1], values?: Parameters<typeof t>[2]) =>
      t(locale, key, values),
    [locale],
  );

  const value = useMemo(
    () => ({
      languagePreference,
      locale,
      setLanguagePreference,
      translate,
    }),
    [languagePreference, locale, setLanguagePreference, translate],
  );

  return <I18nContext value={value}>{children}</I18nContext>;
}
