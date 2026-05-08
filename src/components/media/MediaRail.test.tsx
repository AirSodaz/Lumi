import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LibraryItem } from "../../lib/tauriClient";
import { MediaRail } from "./MediaRail";

function mediaItem(itemType: string, id = itemType): LibraryItem {
  return {
    id,
    itemType,
    providerKind: "emby",
    serverId: "server-1",
    title: id,
  };
}

describe("MediaRail", () => {
  it("uses portrait grid navigation columns when the rail starts with portrait cards", () => {
    render(
      <MediaRail
        emptyText="No items"
        items={[mediaItem("movie", "Movie 1"), mediaItem("series", "Series 1")]}
        onOpenMedia={vi.fn()}
        title="Portrait Rail"
      />,
    );

    expect(screen.getByLabelText("Portrait Rail media")).toHaveAttribute(
      "data-focus-columns",
      "5",
    );
  });

  it("uses landscape grid navigation columns when the rail starts with landscape cards", () => {
    render(
      <MediaRail
        emptyText="No items"
        items={[mediaItem("episode", "Episode 1"), mediaItem("video", "Video 1")]}
        onOpenMedia={vi.fn()}
        title="Landscape Rail"
      />,
    );

    expect(screen.getByLabelText("Landscape Rail media")).toHaveAttribute(
      "data-focus-columns",
      "3",
    );
  });
});
