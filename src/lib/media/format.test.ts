import { describe, expect, it } from "vitest";
import type { LibraryItem } from "../tauriClient";
import { formatMetadata } from "./format";

function mediaItem(itemType: string): LibraryItem {
  return {
    id: `${itemType}-1`,
    itemType,
    providerKind: "emby",
    runtimeSeconds: 7200,
    serverId: "server-1",
    title: itemType,
    year: 2026,
  };
}

describe("media metadata formatting", () => {
  it("formats metadata in English", () => {
    expect(formatMetadata(mediaItem("movie"), "en")).toBe("Movie · 2026 · 2h");
  });

  it("formats metadata in Chinese", () => {
    expect(formatMetadata(mediaItem("movie"), "zh")).toBe("电影 · 2026 · 2小时");
  });
});
