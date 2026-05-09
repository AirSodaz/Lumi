import { describe, expect, it } from "vitest";
import {
  getDetailBackPath,
  mediaDetailPath,
  parseMediaDetailSource,
  settingsPath,
} from "./shellRoutes";

describe("shell route helpers", () => {
  it("encodes and decodes media detail routes with source and parent trail", () => {
    const path = mediaDetailPath({
      from: "library",
      itemId: "season/1",
      libraryId: "library 1",
      parentTrail: ["series/1", "season 0"],
      serverId: "server 1",
    });

    expect(path).toBe(
      "/servers/server%201/items/season%2F1?from=library&libraryId=library+1&parent=series%2F1&parent=season+0",
    );

    const url = new URL(`http://lumi.local${path}`);
    expect(parseMediaDetailSource(url.searchParams)).toEqual({
      from: "library",
      libraryId: "library 1",
      parentTrail: ["series/1", "season 0"],
    });
  });

  it("builds semantic detail back paths before falling back to the source page", () => {
    const current = {
      from: "library" as const,
      libraryId: "library-1",
      parentTrail: ["series-1", "season-1"],
    };

    expect(getDetailBackPath("server-1", current)).toBe(
      "/servers/server-1/items/season-1?from=library&libraryId=library-1&parent=series-1",
    );
    expect(getDetailBackPath("server-1", { ...current, parentTrail: [] })).toBe(
      "/servers/server-1/libraries/library-1",
    );
    expect(
      getDetailBackPath("server-1", {
        from: "favorites",
        parentTrail: ["movie-1"],
      }),
    ).toBe("/servers/server-1/items/movie-1?from=favorites");
    expect(
      getDetailBackPath("server-1", {
        from: "favorites",
        parentTrail: [],
      }),
    ).toBe("/favorites");
  });

  it("builds settings routes with optional add server state", () => {
    expect(settingsPath("mediaServices")).toBe("/settings/media-services");
    expect(settingsPath("mediaServices", { addServer: true })).toBe(
      "/settings/media-services?addServer=1",
    );
    expect(settingsPath("player")).toBe("/settings/player");
  });
});
