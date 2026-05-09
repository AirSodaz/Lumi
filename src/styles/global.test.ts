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
    const featuredHeroBeforeRule = getRule(".featured-hero::before");
    const featuredDotsRule = getRule(".featured-carousel-dots");
    const featuredDotRule = getRule(".featured-carousel-dot");
    const featuredActiveDotRule = getRule(".featured-carousel-dot[aria-pressed=\"true\"]");

    expect(featuredHeroRule).toContain("min-height: clamp(300px, 42vw, 520px);");
    expect(featuredHeroRule).toContain("background-image: var(--featured-artwork);");
    expect(featuredHeroRule).not.toContain("grid-template-columns: minmax(178px, 28%) minmax(0, 1fr);");
    expect(featuredHeroBeforeRule).toContain("background: var(--featured-shade);");
    expect(featuredDotsRule).toContain("position: absolute;");
    expect(featuredDotRule).toContain("width: 7px;");
    expect(featuredActiveDotRule).toContain("width: 22px;");
  });

  it("keeps custom Windows caption buttons aligned with Win11 interaction affordances", () => {
    const controlsRule = getLastRule(".titlebar-window-controls");
    const buttonRule = getLastRule(".titlebar-window-button");
    const buttonHoverRule = getRule(".titlebar-window-button:not(.close):hover");
    const buttonActiveRule = getRule(".titlebar-window-button:not(.close):active");
    const closeHoverRule = getRule(".titlebar-window-button.close:hover");
    const closeActiveRule = getRule(".titlebar-window-button.close:active");

    expect(controlsRule).toContain("align-self: stretch;");
    expect(controlsRule).toContain("margin-right: -4px;");
    expect(buttonRule).toContain("width: 46px;");
    expect(buttonRule).toContain("height: 100%;");
    expect(buttonRule).toContain("border-radius: 0;");
    expect(buttonHoverRule).toContain("background: var(--color-caption-button-hover);");
    expect(buttonActiveRule).toContain("background: var(--color-caption-button-active);");
    expect(closeHoverRule).toContain("background: var(--color-caption-close-hover);");
    expect(closeActiveRule).toContain("background: var(--color-caption-close-active);");
  });
});

function getRule(selector: string) {
  const ruleStart = globalCss.indexOf(`${selector} {`);

  if (ruleStart === -1) {
    throw new Error(`Missing CSS rule for ${selector}`);
  }

  const bodyStart = globalCss.indexOf("{", ruleStart);
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
