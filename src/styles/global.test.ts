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
