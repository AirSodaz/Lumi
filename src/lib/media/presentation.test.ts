import { describe, expect, it } from "vitest";
import type { LibraryItem } from "../tauriClient";
import {
  getMediaCardPresentation,
  getMediaGridColumns,
} from "./presentation";

function mediaItem(itemType: string): LibraryItem {
  return {
    id: `${itemType}-1`,
    itemType,
    providerKind: "emby",
    serverId: "server-1",
    title: itemType,
  };
}

describe("media presentation", () => {
  it.each(["movie", "series", "season", "folder", "collection"])(
    "uses portrait cards for %s items",
    (itemType) => {
      expect(getMediaCardPresentation(mediaItem(itemType)).orientation).toBe(
        "portrait",
      );
    },
  );

  it.each(["episode", "video", "musicVideo"])(
    "uses landscape cards for %s items",
    (itemType) => {
      expect(getMediaCardPresentation(mediaItem(itemType)).orientation).toBe(
        "landscape",
      );
    },
  );

  it("falls back to landscape presentation for unknown item types", () => {
    expect(getMediaCardPresentation(mediaItem("trailer")).orientation).toBe(
      "landscape",
    );
  });

  it("returns focus grid defaults from the dominant card orientation", () => {
    expect(getMediaGridColumns([mediaItem("movie")])).toBe(5);
    expect(getMediaGridColumns([mediaItem("episode")])).toBe(3);
    expect(getMediaGridColumns([])).toBe(3);
  });
});
