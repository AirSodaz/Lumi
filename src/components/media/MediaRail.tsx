import { FocusScope } from "../focus";
import { PosterCard } from "./PosterCard";
import type { LibraryItem } from "../../lib/tauriClient";
import {
  getMediaCardPresentation,
  type MediaCardOrientation,
} from "../../lib/media/presentation";

type MediaRailProps = {
  cardSize?: MediaRailCardSize;
  emptyText: string;
  entry?: boolean;
  items: LibraryItem[];
  loading?: boolean;
  onOpenMedia: (item: LibraryItem) => void;
  orientation?: MediaCardOrientation;
  showProgress?: boolean;
  title: string;
};

type MediaRailCardSize = "compact" | "default";

export function MediaRail({
  cardSize = "default",
  emptyText,
  entry = false,
  items,
  loading = false,
  onOpenMedia,
  orientation,
  showProgress = false,
  title,
}: MediaRailProps) {
  const focusScope = `${title}-rail`;
  const columns = Math.max(1, items.length);
  const inferredOrientation = items[0]
    ? getMediaCardPresentation(items[0]).orientation
    : "landscape";
  const gridOrientation = orientation ?? inferredOrientation;

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
          data-card-size={cardSize}
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
              orientation={orientation}
              progressPercent={showProgress ? item.playedPercentage ?? undefined : undefined}
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
