import type { LibraryItem } from "../tauriClient";
import type { Locale } from "../i18n";

export function formatMetadata(item: LibraryItem, locale: Locale = "en") {
  const parts = [formatItemType(item.itemType, locale)];

  if (item.year) {
    parts.push(String(item.year));
  }

  if (item.runtimeSeconds) {
    parts.push(formatRuntime(item.runtimeSeconds, locale));
  }

  return parts.join(" · ");
}

function formatItemType(itemType: string, locale: Locale) {
  const labels: Record<Locale, Record<string, string>> = {
    en: {
      collection: "Collection",
      episode: "Episode",
      folder: "Folder",
      movie: "Movie",
      musicVideo: "Music Video",
      season: "Season",
      series: "Series",
      video: "Video",
    },
    zh: {
      collection: "合集",
      episode: "集",
      folder: "文件夹",
      movie: "电影",
      musicVideo: "音乐视频",
      season: "季",
      series: "剧集",
      video: "视频",
    },
  };

  return labels[locale][itemType] ?? itemType;
}

function formatRuntime(seconds: number, locale: Locale) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (locale === "zh") {
    if (hours === 0) {
      return `${minutes}分钟`;
    }

    return remainingMinutes === 0
      ? `${hours}小时`
      : `${hours}小时 ${remainingMinutes}分钟`;
  }

  if (hours === 0) {
    return `${minutes}m`;
  }

  return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
}
