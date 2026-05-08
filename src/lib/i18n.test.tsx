import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  I18nProvider,
  languagePreferenceStorageKey,
  resolveLocale,
  t,
  useI18n,
  type LanguagePreference,
} from "./i18n";

function LocaleProbe() {
  const { languagePreference, locale, setLanguagePreference, translate } = useI18n();

  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="preference">{languagePreference}</span>
      <span data-testid="missing">{translate("missing.key")}</span>
      <button onClick={() => setLanguagePreference("zh")} type="button">
        switch zh
      </button>
    </div>
  );
}

describe("i18n", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("resolves Chinese and English from language preferences", () => {
    expect(resolveLocale("system", ["zh-CN", "en-US"])).toBe("zh");
    expect(resolveLocale("system", ["en-HK", "zh-CN"])).toBe("en");
    expect(resolveLocale("zh", ["en-US"])).toBe("zh");
    expect(resolveLocale("en", ["zh-CN"])).toBe("en");
  });

  it("uses English strings as the missing-key fallback", () => {
    expect(t("en", "settings.title")).toBe("Settings");
    expect(t("zh", "settings.title")).toBe("设置");
    expect(t("zh", "missing.key")).toBe("missing.key");
  });

  it("localizes shared fallback status and error messages", () => {
    expect(t("en", "common.enabled")).toBe("Enabled");
    expect(t("zh", "common.enabled")).toBe("已启用");
    expect(t("en", "common.disabled")).toBe("Disabled");
    expect(t("zh", "common.disabled")).toBe("已停用");
    expect(t("en", "app.error.unknown")).toBe("Something went wrong");
    expect(t("zh", "app.error.unknown")).toBe("出现了一点问题");
  });

  it("persists language preference and syncs the document language", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      languagePreferenceStorageKey,
      "en" satisfies LanguagePreference,
    );

    render(
      <I18nProvider>
        <LocaleProbe />
      </I18nProvider>,
    );

    expect(screen.getByTestId("locale")).toHaveTextContent("en");
    expect(screen.getByTestId("preference")).toHaveTextContent("en");
    expect(document.documentElement).toHaveAttribute("lang", "en");

    await user.click(screen.getByRole("button", { name: "switch zh" }));

    expect(screen.getByTestId("locale")).toHaveTextContent("zh");
    expect(screen.getByTestId("preference")).toHaveTextContent("zh");
    expect(window.localStorage.getItem(languagePreferenceStorageKey)).toBe("zh");
    expect(document.documentElement).toHaveAttribute("lang", "zh-CN");
  });
});
