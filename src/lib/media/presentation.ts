import type { LibraryItem } from "../tauriClient";

export type MediaCardOrientation = "landscape" | "portrait";

export type MediaCardPresentation = {
  artLabel: string;
  fallbackCopy: string;
  gridColumns: number;
  orientation: MediaCardOrientation;
};

const portraitItemTypes = new Set([
  "collection",
  "folder",
  "movie",
  "season",
  "series",
]);

const landscapeItemTypes = new Set(["episode", "musicVideo", "video"]);

const gridColumnsByOrientation = {
  landscape: 3,
  portrait: 5,
} satisfies Record<MediaCardOrientation, number>;

export function getMediaCardPresentation(
  item: LibraryItem,
): MediaCardPresentation {
  const orientation = getMediaCardOrientation(item.itemType);

  return {
    artLabel: orientation === "portrait" ? "Poster artwork" : "Thumbnail artwork",
    fallbackCopy: orientation === "portrait" ? "No poster" : "No thumbnail",
    gridColumns: gridColumnsByOrientation[orientation],
    orientation,
  };
}

export function getMediaGridColumns(items: LibraryItem[]) {
  const firstItem = items[0];

  if (!firstItem) {
    return gridColumnsByOrientation.landscape;
  }

  return getMediaCardPresentation(firstItem).gridColumns;
}

function getMediaCardOrientation(itemType: string): MediaCardOrientation {
  if (portraitItemTypes.has(itemType)) {
    return "portrait";
  }

  if (landscapeItemTypes.has(itemType)) {
    return "landscape";
  }

  return "landscape";
}
