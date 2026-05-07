import type { LibraryItem } from "../../lib/tauriClient";
import { formatMetadata } from "../../lib/media/format";
import { FocusableCard } from "../focus";

type PosterCardProps = {
  focusScope: string;
  item?: LibraryItem;
  loading?: boolean;
  onOpen?: (item: LibraryItem) => void;
  progressPercent?: number;
  subtitle?: string;
};

export function PosterCard({
  focusScope,
  item,
  loading = false,
  onOpen,
  progressPercent,
  subtitle,
}: PosterCardProps) {
  if (loading || !item) {
    return (
      <FocusableCard
        activateOnArrow={false}
        className="poster-card is-loading"
        disabled
        focusScope={focusScope}
      >
        <span className="poster-art" />
        <strong>Loading</strong>
        <span>Fetching media</span>
      </FocusableCard>
    );
  }

  const metadata = subtitle ?? formatMetadata(item);

  return (
    <FocusableCard
      activateOnArrow={false}
      className="poster-card"
      focusScope={focusScope}
      onClick={() => onOpen?.(item)}
    >
      <span
        className={item.posterUrl ? "poster-art has-image" : "poster-art"}
        style={
          item.posterUrl
            ? { backgroundImage: `url("${item.posterUrl}")` }
            : undefined
        }
      >
        {item.posterUrl ? null : <span>No artwork</span>}
      </span>
      <strong>{item.title}</strong>
      <span>{metadata}</span>
      {typeof progressPercent === "number" ? (
        <span
          aria-label={`${Math.round(progressPercent)}% watched`}
          className="poster-progress"
        >
          <span style={{ width: `${clampProgress(progressPercent)}%` }} />
        </span>
      ) : null}
    </FocusableCard>
  );
}

function clampProgress(progress: number) {
  return Math.min(100, Math.max(0, progress));
}
