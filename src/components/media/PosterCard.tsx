import { motion, useReducedMotion } from "motion/react";
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
          <strong>Loading</strong>
          <span>Fetching media</span>
        </span>
      </FocusableCard>
    );
  }

  const metadata = subtitle ?? formatMetadata(item);
  const presentation = getMediaCardPresentation(item);
  const cardOrientation = orientation ?? presentation.orientation;

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
        className={item.posterUrl ? "poster-art has-image" : "poster-art"}
        data-motion-surface="poster-art"
        style={
          item.posterUrl
            ? { backgroundImage: `url("${item.posterUrl}")` }
            : undefined
        }
        {...createSurfaceMotion(reducedMotion, 0)}
      >
        {item.posterUrl ? null : <span>{presentation.fallbackCopy}</span>}
      </motion.span>
      <span className="poster-card-copy">
        <strong>{item.title}</strong>
        <span>{metadata}</span>
      </span>
      {typeof progressPercent === "number" ? (
        <span
          aria-label={`${Math.round(progressPercent)}% watched`}
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
