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
