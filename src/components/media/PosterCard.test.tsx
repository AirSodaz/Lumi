import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { LibraryItem } from "../../lib/tauriClient";
import { PosterCard } from "./PosterCard";

function mediaItem(itemType: string): LibraryItem {
  return {
    id: `${itemType}-1`,
    itemType,
    providerKind: "emby",
    serverId: "server-1",
    title: itemType,
  };
}

describe("PosterCard", () => {
  it.each(["movie", "series", "season", "folder", "collection"])(
    "renders %s as a portrait card",
    (itemType) => {
      render(<PosterCard focusScope="test-cards" item={mediaItem(itemType)} />);

      expect(screen.getByRole("button", { name: itemType })).toHaveAttribute(
        "data-card-orientation",
        "portrait",
      );
    },
  );

  it.each(["episode", "video", "musicVideo"])(
    "renders %s as a landscape card",
    (itemType) => {
      render(<PosterCard focusScope="test-cards" item={mediaItem(itemType)} />);

      expect(screen.getByRole("button", { name: itemType })).toHaveAttribute(
        "data-card-orientation",
        "landscape",
      );
    },
  );

  it("allows callers to override the inferred orientation", () => {
    render(
      <PosterCard
        focusScope="test-cards"
        item={mediaItem("movie")}
        orientation="landscape"
      />,
    );

    expect(screen.getByRole("button", { name: "movie" })).toHaveAttribute(
      "data-card-orientation",
      "landscape",
    );
  });

  it("prefers backdrop artwork for landscape cards", () => {
    const item = {
      ...mediaItem("folder"),
      backdropUrl: "https://example.test/backdrop.jpg",
      posterUrl: "https://example.test/poster.jpg",
    };
    const { container } = render(
      <PosterCard focusScope="test-cards" item={item} orientation="landscape" />,
    );

    expect(container.querySelector(".poster-art")).toHaveStyle({
      backgroundImage: 'url("https://example.test/backdrop.jpg")',
    });
  });
});
