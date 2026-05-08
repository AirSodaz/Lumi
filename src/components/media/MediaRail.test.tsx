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
  it("uses item-count navigation columns for a horizontal portrait rail", () => {
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
      "2",
    );
  });

  it("uses item-count navigation columns for a horizontal landscape rail", () => {
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
      "2",
    );
  });

  it("allows callers to force a horizontal landscape rail", () => {
    render(
      <MediaRail
        cardSize="compact"
        emptyText="No items"
        items={[mediaItem("folder", "Movies"), mediaItem("folder", "TV Shows")]}
        onOpenMedia={vi.fn()}
        orientation="landscape"
        title="Library Rail"
      />,
    );

    expect(screen.getByLabelText("Library Rail media")).toHaveAttribute(
      "data-focus-columns",
      "2",
    );
    expect(screen.getByLabelText("Library Rail media")).toHaveAttribute(
      "data-grid-orientation",
      "landscape",
    );
    expect(screen.getByLabelText("Library Rail media")).toHaveAttribute(
      "data-card-size",
      "compact",
    );
    expect(screen.getByRole("button", { name: "Movies" })).toHaveAttribute(
      "data-card-orientation",
      "landscape",
    );
  });

  it("renders watched progress for continue-watching rows", () => {
    render(
      <MediaRail
        emptyText="No items"
        items={[
          {
            ...mediaItem("movie", "Movie 1"),
            playedPercentage: 45,
            playbackPositionSeconds: 1800,
          },
        ]}
        onOpenMedia={vi.fn()}
        showProgress
        title="Continue Watching"
      />,
    );

    expect(screen.getByLabelText("45% watched")).toBeInTheDocument();
    expect(screen.getByLabelText("Continue Watching media")).toHaveAttribute(
      "data-card-size",
      "default",
    );
  });
});
