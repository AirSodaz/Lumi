import { FocusScope } from "../focus";
import { PosterCard } from "./PosterCard";
import type { LibraryItem } from "../../lib/tauriClient";
import {
  getMediaCardPresentation,
  getMediaGridColumns,
} from "../../lib/media/presentation";

type MediaRailProps = {
  emptyText: string;
  entry?: boolean;
  items: LibraryItem[];
  loading?: boolean;
  onOpenMedia: (item: LibraryItem) => void;
  title: string;
};

export function MediaRail({
  emptyText,
  entry = false,
  items,
  loading = false,
  onOpenMedia,
  title,
}: MediaRailProps) {
  const focusScope = `${title}-rail`;
  const columns = getMediaGridColumns(items);
  const gridOrientation = items[0]
    ? getMediaCardPresentation(items[0]).orientation
    : "landscape";

  return (
    <section className="media-rail" aria-labelledby={focusScope}>
      <div className="rail-header">
        <h2 id={focusScope}>{title}</h2>
      </div>
      {items.length > 0 ? (
        <FocusScope
          aria-label={`${title} media`}
          className="rail-items"
          columns={columns}
          data-grid-orientation={gridOrientation}
          entry={entry}
          focusKey={items.map((item) => item.id).join(":")}
          scope={focusScope}
        >
          {items.map((item) => (
            <PosterCard
              focusScope={focusScope}
              item={item}
              key={item.id}
              onOpen={onOpenMedia}
            />
          ))}
        </FocusScope>
      ) : (
        <div className="empty-state compact">
          <strong>{loading ? "Loading media" : "No media found"}</strong>
          <span>{loading ? "Fetching library items" : emptyText}</span>
        </div>
      )}
    </section>
  );
}
