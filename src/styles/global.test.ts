import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const globalCss = readFileSync("src/styles/global.css", "utf8");

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

  it("styles macOS and Windows sidebars as native source lists instead of floating glass cards", () => {
    const macShellRule = getRule(".lumi-shell[data-platform=\"macos\"]");
    const windowsShellRule = getRule(".lumi-shell[data-platform=\"windows\"]");
    const macSidebarRule = getRule(".lumi-shell[data-platform=\"macos\"] .shell-sidebar");
    const windowsSidebarRule = getRule(".lumi-shell[data-platform=\"windows\"] .shell-sidebar");
    const macSectionLabelRule = getRule(".sidebar-section-label");

    expect(macShellRule).toContain("--macos-source-list-width:");
    expect(windowsShellRule).toContain("--windows-source-list-width:");
    expect(macSidebarRule).toContain("height: calc(100vh - var(--shell-top-offset));");
    expect(macSidebarRule).toContain("margin: 0;");
    expect(macSidebarRule).toContain("border-radius: 0;");
    expect(macSidebarRule).toContain("border-right: 1px solid var(--color-border-soft);");
    expect(macSidebarRule).toContain("background: transparent;");
    expect(macSidebarRule).toContain("box-shadow: none;");
    expect(macSidebarRule).toContain("backdrop-filter: none;");
    expect(windowsSidebarRule).toContain("height: calc(100vh - var(--shell-top-offset));");
    expect(windowsSidebarRule).toContain("margin: 0;");
    expect(windowsSidebarRule).toContain("border-radius: 0;");
    expect(windowsSidebarRule).toContain("border-right: 1px solid var(--color-border-soft);");
    expect(windowsSidebarRule).toContain("background: transparent;");
    expect(windowsSidebarRule).toContain("box-shadow: none;");
    expect(windowsSidebarRule).toContain("backdrop-filter: none;");
    expect(macSectionLabelRule).toContain("text-transform: uppercase;");
  });

  it("keeps the Windows titlebar transparent so native Mica shows through", () => {
    const titlebarRule = getRule(".windows-titlebar");

    expect(titlebarRule).toContain("background: transparent;");
    expect(titlebarRule).toContain("backdrop-filter: none;");
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
