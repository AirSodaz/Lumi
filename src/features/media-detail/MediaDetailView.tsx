import { ChevronLeft, Film, Play } from "lucide-react";
import { FocusScope } from "../../components/focus";
import { PosterCard } from "../../components/media";
import { formatMetadata } from "../../lib/media/format";
import {
  useChildren,
  useItemDetail,
  type LibraryItem,
} from "../../lib/tauriClient";

type MediaDetailViewProps = {
  itemId: string;
  onBack: () => void;
  onOpenMedia: (item: LibraryItem) => void;
  returnLabel: string;
  serverId: string;
};

const browsableTypes = new Set(["collection", "folder", "season", "series"]);

export function MediaDetailView({
  itemId,
  onBack,
  onOpenMedia,
  returnLabel,
  serverId,
}: MediaDetailViewProps) {
  const detail = useItemDetail(serverId, itemId);
  const item = detail.data?.item ?? null;
  const shouldLoadChildren = item ? browsableTypes.has(item.itemType) : false;
  const children = useChildren(shouldLoadChildren ? serverId : null, item?.id ?? null);

  if (detail.isLoading) {
    return (
      <section className="view-stack" aria-labelledby="media-detail-loading">
        <DetailBackButton onBack={onBack} returnLabel={returnLabel} />
        <div className="empty-state">
          <Film aria-hidden="true" size={28} />
          <strong id="media-detail-loading">Loading media details</strong>
          <span>Fetching item data</span>
        </div>
      </section>
    );
  }

  if (detail.isError || !item) {
    return (
      <section className="view-stack" aria-labelledby="media-detail-error">
        <DetailBackButton onBack={onBack} returnLabel={returnLabel} />
        <div className="empty-state">
          <Film aria-hidden="true" size={28} />
          <strong id="media-detail-error">Could not load media details</strong>
          <span>Try again from the library view</span>
        </div>
      </section>
    );
  }

  const mediaSources = detail.data?.mediaSources ?? [];

  return (
    <section className="view-stack media-detail" aria-labelledby="media-title">
      <DetailBackButton onBack={onBack} returnLabel={returnLabel} />
      <section
        className="detail-hero"
        style={
          item.backdropUrl
            ? { backgroundImage: `url("${item.backdropUrl}")` }
            : undefined
        }
      >
        <div className="detail-poster" aria-hidden="true">
          {item.posterUrl ? (
            <img alt="" src={item.posterUrl} />
          ) : (
            <span>No artwork</span>
          )}
        </div>
        <div className="detail-copy">
          <p className="eyebrow">{formatMetadata(item)}</p>
          <h1 id="media-title">{item.title}</h1>
          <p className="muted">{item.overview ?? "No overview available."}</p>
          <div className="detail-actions">
            <button className="primary-action" disabled type="button">
              <Play aria-hidden="true" size={17} />
              <span>Play</span>
            </button>
            <span className="status-chip">
              {mediaSources.length > 0
                ? `${mediaSources.length} source ready for P6`
                : "No playback source"}
            </span>
          </div>
        </div>
      </section>

      {shouldLoadChildren ? (
        <section className="media-rail" aria-labelledby="detail-children">
          <h2 id="detail-children">More from {item.title}</h2>
          {children.isError ? (
            <div className="empty-state compact">
              <strong>Could not load related media</strong>
              <span>Try again later</span>
            </div>
          ) : children.isLoading ? (
            <div className="rail-items">
              {[0, 1, 2].map((slot) => (
                <PosterCard focusScope="detail-children" key={slot} loading />
              ))}
            </div>
          ) : children.data?.items.length ? (
            <FocusScope
              aria-label={`More from ${item.title}`}
              className="rail-items"
              focusKey={`${item.id}:${children.data.items
                .map((child) => child.id)
                .join(":")}`}
              scope="detail-children"
            >
              {children.data.items.map((child) => (
                <PosterCard
                  focusScope="detail-children"
                  item={child}
                  key={child.id}
                  onOpen={onOpenMedia}
                />
              ))}
            </FocusScope>
          ) : (
            <div className="empty-state compact">
              <strong>No media found</strong>
              <span>{item.title}</span>
            </div>
          )}
        </section>
      ) : null}
    </section>
  );
}

type DetailBackButtonProps = {
  onBack: () => void;
  returnLabel: string;
};

function DetailBackButton({ onBack, returnLabel }: DetailBackButtonProps) {
  return (
    <button className="secondary-action back-action" onClick={onBack} type="button">
      <ChevronLeft aria-hidden="true" size={18} />
      <span>Back to {returnLabel}</span>
    </button>
  );
}
