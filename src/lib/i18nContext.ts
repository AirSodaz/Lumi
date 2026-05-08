import { createContext } from "react";
import type {
  LanguagePreference,
  Locale,
  TranslationKey,
  TranslationValues,
} from "./i18nCore";

export type I18nContextValue = {
  languagePreference: LanguagePreference;
  locale: Locale;
  setLanguagePreference: (languagePreference: LanguagePreference) => void;
  translate: (key: TranslationKey | string, values?: TranslationValues) => string;
};

export const I18nContext = createContext<I18nContextValue | null>(null);
