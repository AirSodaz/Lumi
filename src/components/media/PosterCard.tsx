import { motion, useReducedMotion } from "motion/react";
import { useI18n } from "../../lib/i18n";
import type { LibraryItem } from "../../lib/tauriClient";
import { formatMetadata } from "../../lib/media/format";
import {
  getMediaCardPresentation,
  type MediaCardOrientation,
} from "../../lib/media/presentation";
import { createSurfaceMotion } from "../../lib/motion/presets";
import { FocusableCard } from "../focus";

type PosterCardProps = {
  focusScope: string;
  item?: LibraryItem;
  loading?: boolean;
  onOpen?: (item: LibraryItem) => void;
  orientation?: MediaCardOrientation;
  progressPercent?: number;
  subtitle?: string;
};

export function PosterCard({
  focusScope,
  item,
  loading = false,
  onOpen,
  orientation,
  progressPercent,
  subtitle,
}: PosterCardProps) {
  const reducedMotion = useReducedMotion();
  const { locale, translate } = useI18n();
  const loadingOrientation = orientation ?? "landscape";

  if (loading || !item) {
    return (
      <FocusableCard
        activateOnArrow={false}
        className="poster-card is-loading"
        data-card-orientation={loadingOrientation}
        disabled
        focusScope={focusScope}
        motionKind="card"
      >
        <span className="poster-art" />
        <span className="poster-card-copy">
          <strong>{translate("media.card.loading")}</strong>
          <span>{translate("media.card.fetching")}</span>
        </span>
      </FocusableCard>
    );
  }

  const metadata = subtitle ?? formatMetadata(item, locale);
  const presentation = getMediaCardPresentation(item);
  const cardOrientation = orientation ?? presentation.orientation;
  const artworkUrl = getArtworkUrl(item, cardOrientation);
  const fallbackCopy =
    cardOrientation === "portrait"
      ? translate("media.card.noPoster")
      : translate("media.card.noThumbnail");

  return (
    <FocusableCard
      activateOnArrow={false}
      aria-label={item.title}
      className="poster-card"
      data-card-orientation={cardOrientation}
      focusScope={focusScope}
      motionKind="card"
      onClick={() => onOpen?.(item)}
    >
      <motion.span
        className={artworkUrl ? "poster-art has-image" : "poster-art"}
        data-motion-surface="poster-art"
        style={
          artworkUrl
            ? { backgroundImage: `url("${artworkUrl}")` }
            : undefined
        }
        {...createSurfaceMotion(reducedMotion, 0)}
      >
        {artworkUrl ? null : <span>{fallbackCopy}</span>}
      </motion.span>
      <span className="poster-card-copy">
        <strong>{item.title}</strong>
        <span>{metadata}</span>
      </span>
      {typeof progressPercent === "number" ? (
        <span
          aria-label={translate("media.progress.watched", {
            percent: Math.round(progressPercent),
          })}
          className="poster-progress"
        >
          <motion.span
            animate={{ scaleX: clampProgress(progressPercent) / 100 }}
            initial={{ scaleX: 0 }}
            style={{ transformOrigin: "0 50%" }}
            transition={reducedMotion ? { duration: 0.01 } : { duration: 0.24 }}
          />
        </span>
      ) : null}
    </FocusableCard>
  );
}

function clampProgress(progress: number) {
  return Math.min(100, Math.max(0, progress));
}

function getArtworkUrl(item: LibraryItem, orientation: MediaCardOrientation) {
  if (orientation === "landscape") {
    return item.backdropUrl ?? item.posterUrl ?? null;
  }

  return item.posterUrl ?? null;
}
