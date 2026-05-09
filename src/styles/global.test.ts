import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const globalCss = readFileSync("src/styles/global.css", "utf8").replace(/\r\n/g, "\n");

describe("global rail styles", () => {
  it("keeps horizontal rails padded so hover and focus scale are not clipped", () => {
    const railItemsRule = getRule(".rail-items");

    expect(railItemsRule).toContain("padding: 12px 14px 22px;");
    expect(railItemsRule).toContain("margin: -10px -12px -12px;");
    expect(railItemsRule).toContain("scroll-padding-inline: 14px;");
  });

  it("defines light theme tokens for the app chrome and shared surfaces", () => {
    const lightThemeRule = getRule(":root[data-theme=\"light\"]");

    expect(lightThemeRule).toContain("--color-background:");
    expect(lightThemeRule).toContain("--color-background-raised:");
    expect(lightThemeRule).toContain("--color-surface-fallback:");
    expect(lightThemeRule).toContain("--color-surface-content-glass:");
    expect(lightThemeRule).toContain("--color-surface-control:");
    expect(lightThemeRule).toContain("--color-border:");
    expect(lightThemeRule).toContain("--color-text-primary:");
    expect(lightThemeRule).toContain("--scrollbar-thumb:");
    expect(lightThemeRule).toContain("--shadow-panel:");
  });

  it("defines explicit neutral dark theme tokens for readable app chrome", () => {
    const darkThemeRule = getRule(":root,\n:root[data-theme=\"dark\"]");

    expect(darkThemeRule).toContain("--color-background: #0b0f12;");
    expect(darkThemeRule).toContain("--color-background-raised: #121820;");
    expect(darkThemeRule).toContain("--color-surface-fallback: #161d25;");
    expect(darkThemeRule).toContain("--color-text-primary: #f4f7f8;");
    expect(darkThemeRule).toContain("--color-selected-background: rgb(230 238 241 / 92%);");
    expect(darkThemeRule).toContain("--color-body-background:");
    expect(darkThemeRule).not.toContain("#251f1b");
    expect(darkThemeRule).not.toContain("#1b110c");
  });

  it("styles the Home featured carousel as one full-stage hero surface", () => {
    const featuredHeroRule = getRule(".featured-hero");
    const featuredBackdropLayerRule = getRule(".featured-backdrop-layer");
    const featuredBackdropImageRule = getRule(".featured-backdrop-layer::before");
    const featuredHeroBeforeRule = getRule(".featured-hero::before");
    const featuredCopyRule = getRule(".featured-copy");
    const featuredDotsRule = getRule(".featured-carousel-dots");
    const featuredDotRule = getRule(".featured-carousel-dot");
    const featuredActiveDotRule = getRule(".featured-carousel-dot[aria-pressed=\"true\"]");
    const reducedMotionRule = getRule(
      "@media (prefers-reduced-motion: reduce)",
      ".featured-backdrop-layer::before",
    );

    expect(featuredHeroRule).toContain("min-height: clamp(300px, 42vw, 520px);");
    expect(featuredHeroRule).not.toContain("background-image: var(--featured-artwork);");
    expect(featuredHeroRule).not.toContain("grid-template-columns: minmax(178px, 28%) minmax(0, 1fr);");
    expect(featuredBackdropLayerRule).toContain("position: absolute;");
    expect(featuredBackdropLayerRule).toContain("inset: -18px;");
    expect(featuredBackdropLayerRule).toContain("pointer-events: none;");
    expect(featuredBackdropImageRule).toContain("background-image: var(--featured-artwork);");
    expect(featuredBackdropImageRule).toContain("animation: featured-drift 12s");
    expect(featuredHeroBeforeRule).toContain("background: var(--featured-shade);");
    expect(featuredCopyRule).toContain("position: relative;");
    expect(featuredCopyRule).toContain("z-index: 2;");
    expect(featuredDotsRule).toContain("position: absolute;");
    expect(featuredDotRule).toContain("width: 7px;");
    expect(featuredDotRule).toContain("opacity var(--motion-focus-enter);");
    expect(featuredActiveDotRule).toContain("width: 22px;");
    expect(reducedMotionRule).toContain("animation: none;");
  });

  it("styles the no-server Home entry as a stable standalone setup surface", () => {
    const noServerRule = getRule(".home-no-server");
    const noServerActionsRule = getRule(".home-no-server-actions");

    expect(noServerRule).toContain("min-height: clamp(320px, 44vw, 500px);");
    expect(noServerRule).toContain("display: grid;");
    expect(noServerRule).toContain("border: 1px solid var(--color-border-soft);");
    expect(noServerRule).toContain("border-radius: 20px;");
    expect(noServerActionsRule).toContain("display: flex;");
    expect(noServerActionsRule).toContain("flex-wrap: wrap;");
  });

  it("keeps custom Windows caption buttons aligned with Win11 interaction affordances", () => {
    const controlsRule = getLastRule(".titlebar-window-controls");
    const buttonRule = getRuleContaining(".titlebar-window-button", "width: 46px;");
    const compactButtonRule = getRule(
      "@media (max-width: 720px)",
      ".titlebar-window-button",
    );
    const buttonHoverRule = getRule(".titlebar-window-button:not(.close):hover");
    const buttonActiveRule = getRule(".titlebar-window-button:not(.close):active");
    const closeHoverRule = getRule(".titlebar-window-button.close:hover");
    const closeActiveRule = getRule(".titlebar-window-button.close:active");

    expect(controlsRule).toContain("align-self: stretch;");
    expect(controlsRule).toContain("margin-right: -4px;");
    expect(buttonRule).toContain("width: 46px;");
    expect(buttonRule).toContain("height: 100%;");
    expect(buttonRule).toContain("border-radius: 0;");
    expect(compactButtonRule).toContain("width: 38px;");
    expect(buttonHoverRule).toContain("background: var(--color-caption-button-hover);");
    expect(buttonActiveRule).toContain("background: var(--color-caption-button-active);");
    expect(closeHoverRule).toContain("background: var(--color-caption-close-hover);");
    expect(closeActiveRule).toContain("background: var(--color-caption-close-active);");
  });

  it("styles macOS and Windows sidebars as fused native source lists", () => {
    const macShellRule = getLastRule(".lumi-shell[data-platform=\"macos\"]");
    const windowsShellRule = getLastRule(".lumi-shell[data-platform=\"windows\"]");
    const macSidebarRule = getRule(".lumi-shell[data-platform=\"macos\"] .shell-sidebar");
    const windowsSidebarRule = getRule(".lumi-shell[data-platform=\"windows\"] .shell-sidebar");
    const macSectionLabelRule = getRule(".sidebar-section-label");

    expect(macShellRule).toContain("--macos-source-list-width:");
    expect(windowsShellRule).toContain("--windows-source-list-width:");
    expect(macSidebarRule).toContain("height: calc(100vh - var(--shell-top-offset));");
    expect(macSidebarRule).toContain("margin: 0;");
    expect(macSidebarRule).toContain("border-radius: 0;");
    expect(macSidebarRule).toContain("border-right: 0;");
    expect(macSidebarRule).toContain("background: transparent;");
    expect(macSidebarRule).toContain("box-shadow: none;");
    expect(macSidebarRule).toContain("backdrop-filter: none;");
    expect(windowsSidebarRule).toContain("height: calc(100vh - var(--shell-top-offset));");
    expect(windowsSidebarRule).toContain("margin: 0;");
    expect(windowsSidebarRule).toContain("border-radius: 0;");
    expect(windowsSidebarRule).toContain("border-right: 0;");
    expect(windowsSidebarRule).toContain("background: transparent;");
    expect(windowsSidebarRule).toContain("box-shadow: none;");
    expect(windowsSidebarRule).toContain("backdrop-filter: none;");
    expect(macSectionLabelRule).toContain("text-transform: uppercase;");
  });

  it("keeps the Windows titlebar fused with the native Mica shell", () => {
    const titlebarRule = getRule(".windows-titlebar");

    expect(titlebarRule).toContain("border-bottom: 0;");
    expect(titlebarRule).toContain("background: transparent;");
    expect(titlebarRule).toContain("backdrop-filter: none;");
  });

  it("rounds the content corner where native chrome meets the content surface", () => {
    const shellRule = getRule(".lumi-shell");
    const nativeVignetteRule = getRule(
      ".lumi-shell[data-platform=\"macos\"] .shell-vignette,\n.lumi-shell[data-platform=\"windows\"] .shell-vignette",
    );
    const contentRule = getRule(".shell-content");
    const compactShellRule = getRule("@media (max-width: 720px)", ".lumi-shell");

    expect(shellRule).toContain("--shell-content-corner-radius: 22px;");
    expect(nativeVignetteRule).toContain("border-top-left-radius: var(--shell-content-corner-radius);");
    expect(contentRule).toContain("border-top-left-radius: var(--shell-content-corner-radius);");
    expect(contentRule).toContain("clip-path: inset(0 round var(--shell-content-corner-radius) 0 0 0);");
    expect(compactShellRule).toContain("--shell-content-corner-radius: 16px;");
  });

  it("uses platform-native smooth rounded sidebar item hover states without motion drift", () => {
    const macShellRule = getLastRule(".lumi-shell[data-platform=\"macos\"]");
    const windowsShellRule = getLastRule(".lumi-shell[data-platform=\"windows\"]");
    const lightMacShellRule = getRule(":root[data-theme=\"light\"] .lumi-shell[data-platform=\"macos\"]");
    const lightWindowsShellRule = getRule(":root[data-theme=\"light\"] .lumi-shell[data-platform=\"windows\"]");
    const nativeNavButtonRule = getRule(
      ".lumi-shell[data-platform=\"macos\"] .nav-button,\n.lumi-shell[data-platform=\"windows\"] .nav-button",
    );
    const nativeNavHoverRule = getRule(
      ".lumi-shell[data-platform=\"macos\"] .nav-button:hover,\n.lumi-shell[data-platform=\"windows\"] .nav-button:hover",
    );
    const nativeNavActiveRule = getRule(
      ".lumi-shell[data-platform=\"macos\"] .nav-button:active,\n.lumi-shell[data-platform=\"windows\"] .nav-button:active",
    );
    const nativeNavSelectedRule = getRule(
      ".lumi-shell[data-platform=\"macos\"] .nav-button[aria-current=\"page\"],\n.lumi-shell[data-platform=\"windows\"] .nav-button[aria-current=\"page\"]",
    );
    const windowsNavIndicatorRule = getRule(
      ".lumi-shell[data-platform=\"windows\"] .nav-button[aria-current=\"page\"]::before",
    );

    expect(macShellRule).toContain("--sidebar-item-radius: 10px;");
    expect(macShellRule).toContain("--sidebar-item-hover-background:");
    expect(macShellRule).toContain("--sidebar-item-selected-background:");
    expect(windowsShellRule).toContain("--sidebar-item-radius: 10px;");
    expect(windowsShellRule).toContain("--sidebar-item-hover-background:");
    expect(windowsShellRule).toContain("--sidebar-item-selected-background:");
    expect(lightMacShellRule).toContain("--sidebar-item-selected-background:");
    expect(lightWindowsShellRule).toContain("--sidebar-item-selected-background:");
    expect(nativeNavButtonRule).toContain("border-radius: var(--sidebar-item-radius);");
    expect(nativeNavButtonRule).not.toContain("border-radius: 999px;");
    expect(nativeNavButtonRule).toContain("transition:");
    expect(nativeNavButtonRule).toContain("background-color var(--motion-focus-enter)");
    expect(nativeNavButtonRule).toContain("color var(--motion-focus-enter)");
    expect(nativeNavButtonRule).toContain("border-color var(--motion-focus-enter)");
    expect(nativeNavButtonRule).not.toContain("transform");
    expect(nativeNavHoverRule).toContain("background: var(--sidebar-item-hover-background);");
    expect(nativeNavHoverRule).not.toContain("transform");
    expect(nativeNavActiveRule).toContain("background: var(--sidebar-item-pressed-background);");
    expect(nativeNavSelectedRule).toContain("border-color: transparent;");
    expect(nativeNavSelectedRule).toContain("background: var(--sidebar-item-selected-background);");
    expect(nativeNavSelectedRule).toContain("box-shadow: none;");
    expect(nativeNavSelectedRule).not.toContain("transform");
    expect(windowsNavIndicatorRule).toContain("left: 2px;");
    expect(windowsNavIndicatorRule).toContain("width: 3px;");
    expect(windowsNavIndicatorRule).toContain("height: 16px;");
    expect(windowsNavIndicatorRule).toContain("border-radius: 999px;");
    expect(windowsNavIndicatorRule).toContain("background: var(--color-accent);");
    expect(globalCss).not.toContain(
      ".lumi-shell[data-platform=\"macos\"] .nav-button[aria-current=\"page\"]::before",
    );
  });

  it("styles Settings navigation as a platform-native source list on desktop", () => {
    const nativeSettingsTabsRule = getRule(
      ".lumi-shell[data-platform=\"macos\"] .settings-tabs,\n.lumi-shell[data-platform=\"windows\"] .settings-tabs",
    );
    const nativeSettingsButtonRule = getRule(
      ".lumi-shell[data-platform=\"macos\"] .settings-tabs button,\n.lumi-shell[data-platform=\"windows\"] .settings-tabs button",
    );
    const nativeSettingsHoverRule = getRule(
      ".lumi-shell[data-platform=\"macos\"] .settings-tabs button:hover,\n.lumi-shell[data-platform=\"windows\"] .settings-tabs button:hover",
    );
    const nativeSettingsActiveRule = getRule(
      ".lumi-shell[data-platform=\"macos\"] .settings-tabs button:active,\n.lumi-shell[data-platform=\"windows\"] .settings-tabs button:active",
    );
    const nativeSettingsSelectedRule = getRule(
      ".lumi-shell[data-platform=\"macos\"] .settings-tabs button[aria-current=\"page\"],\n.lumi-shell[data-platform=\"windows\"] .settings-tabs button[aria-current=\"page\"]",
    );
    const windowsSettingsIndicatorRule = getRule(
      ".lumi-shell[data-platform=\"windows\"] .settings-tabs button[aria-current=\"page\"]::before",
    );
    const compactSettingsTabsRule = getRule("@media (max-width: 1120px)", ".settings-tabs");

    expect(nativeSettingsTabsRule).toContain("border: 0;");
    expect(nativeSettingsTabsRule).toContain("background: transparent;");
    expect(nativeSettingsTabsRule).toContain("box-shadow: none;");
    expect(nativeSettingsTabsRule).toContain("backdrop-filter: none;");
    expect(nativeSettingsButtonRule).toContain("min-height: 30px;");
    expect(nativeSettingsButtonRule).toContain("border-radius: var(--sidebar-item-radius);");
    expect(nativeSettingsButtonRule).toContain("transition:");
    expect(nativeSettingsButtonRule).toContain("background-color var(--motion-focus-enter)");
    expect(nativeSettingsButtonRule).not.toContain("border-radius: 999px;");
    expect(nativeSettingsHoverRule).toContain("background: var(--sidebar-item-hover-background);");
    expect(nativeSettingsActiveRule).toContain("background: var(--sidebar-item-pressed-background);");
    expect(nativeSettingsSelectedRule).toContain("border-color: transparent;");
    expect(nativeSettingsSelectedRule).toContain("background: var(--sidebar-item-selected-background);");
    expect(nativeSettingsSelectedRule).toContain("box-shadow: none;");
    expect(windowsSettingsIndicatorRule).toContain("left: 2px;");
    expect(windowsSettingsIndicatorRule).toContain("width: 3px;");
    expect(windowsSettingsIndicatorRule).toContain("height: 16px;");
    expect(windowsSettingsIndicatorRule).toContain("border-radius: 999px;");
    expect(windowsSettingsIndicatorRule).toContain("background: var(--color-accent);");
    expect(globalCss).not.toContain(
      ".lumi-shell[data-platform=\"macos\"] .settings-tabs button[aria-current=\"page\"]::before",
    );
    expect(compactSettingsTabsRule).toContain("grid-template-columns: repeat(4, minmax(0, 1fr));");
  });
});

function getRule(selector: string, nestedSelector?: string) {
  const ruleStart = globalCss.indexOf(`${selector} {`);

  if (ruleStart === -1) {
    throw new Error(`Missing CSS rule for ${selector}`);
  }

  const nestedRuleStart = nestedSelector
    ? globalCss.indexOf(`${nestedSelector} {`, ruleStart)
    : ruleStart;

  if (nestedRuleStart === -1) {
    throw new Error(`Missing CSS rule for ${nestedSelector} inside ${selector}`);
  }

  const bodyStart = globalCss.indexOf("{", nestedRuleStart);
  const bodyEnd = globalCss.indexOf("}", bodyStart);

  return globalCss.slice(bodyStart + 1, bodyEnd);
}

function getLastRule(selector: string) {
  const ruleStart = globalCss.lastIndexOf(`${selector} {`);

  if (ruleStart === -1) {
    throw new Error(`Missing CSS rule for ${selector}`);
  }

  const bodyStart = globalCss.indexOf("{", ruleStart);
  const bodyEnd = globalCss.indexOf("}", bodyStart);

  return globalCss.slice(bodyStart + 1, bodyEnd);
}

function getRuleContaining(selector: string, declaration: string) {
  let searchStart = 0;

  while (searchStart < globalCss.length) {
    const ruleStart = globalCss.indexOf(`${selector} {`, searchStart);

    if (ruleStart === -1) {
      break;
    }

    const bodyStart = globalCss.indexOf("{", ruleStart);
    const bodyEnd = globalCss.indexOf("}", bodyStart);
    const body = globalCss.slice(bodyStart + 1, bodyEnd);

    if (body.includes(declaration)) {
      return body;
    }

    searchStart = bodyEnd + 1;
  }

  throw new Error(`Missing CSS rule for ${selector} containing ${declaration}`);
}
