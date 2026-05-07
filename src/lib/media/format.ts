import type { LibraryItem } from "../tauriClient";

export function formatMetadata(item: LibraryItem) {
  const parts = [formatItemType(item.itemType)];

  if (item.year) {
    parts.push(String(item.year));
  }

  if (item.runtimeSeconds) {
    parts.push(formatRuntime(item.runtimeSeconds));
  }

  return parts.join(" · ");
}

function formatItemType(itemType: string) {
  const labels: Record<string, string> = {
    collection: "Collection",
    episode: "Episode",
    folder: "Folder",
    movie: "Movie",
    season: "Season",
    series: "Series",
  };

  return labels[itemType] ?? itemType;
}

function formatRuntime(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours === 0) {
    return `${minutes}m`;
  }

  return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
}
