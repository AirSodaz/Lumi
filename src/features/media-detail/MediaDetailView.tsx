import { ChevronLeft, Film, Play } from "lucide-react";
import { useState } from "react";
import { AnimatePresence } from "motion/react";
import { FocusScope } from "../../components/focus";
import { CinematicHero, GlassPanel } from "../../components/layout";
import { PosterCard } from "../../components/media";
import { MotionButton } from "../../components/motion";
import { formatMetadata } from "../../lib/media/format";
import {
  getMediaCardPresentation,
  getMediaGridColumns,
} from "../../lib/media/presentation";
import {
  useChildren,
  useItemDetail,
  useOpenPlayback,
  type AppError,
  type LibraryItem,
  type PlayerSession,
} from "../../lib/tauriClient";
import { PlayerControls } from "../player/PlayerControls";

type MediaDetailViewProps = {
  itemId: string;
  onBack: () => void;
  onOpenMedia: (item: LibraryItem) => void;
  returnLabel: string;
  serverId: string;
};

const browsableTypes = new Set(["collection", "folder", "season", "series"]);
const playableTypes = new Set(["episode", "movie", "musicVideo", "video"]);
const containerPlaybackTypes = browsableTypes;

export function MediaDetailView({
  itemId,
  onBack,
  onOpenMedia,
  returnLabel,
  serverId,
}: MediaDetailViewProps) {
  const detail = useItemDetail(serverId, itemId);
  const openPlayback = useOpenPlayback();
  const [activeSession, setActiveSession] = useState<PlayerSession | null>(null);
  const [playbackError, setPlaybackError] = useState<AppError | null>(null);
  const item = detail.data?.item ?? null;
  const shouldLoadChildren = item ? browsableTypes.has(item.itemType) : false;
  const canPlay = item
    ? playableTypes.has(item.itemType) || containerPlaybackTypes.has(item.itemType)
    : false;
  const children = useChildren(shouldLoadChildren ? serverId : null, item?.id ?? null);

  if (detail.isLoading) {
    return (
      <section className="view-stack" aria-labelledby="media-detail-loading">
        <DetailBackButton onBack={onBack} returnLabel={returnLabel} />
        <GlassPanel className="empty-state">
          <Film aria-hidden="true" size={22} />
          <strong id="media-detail-loading">Loading media details</strong>
          <span>Fetching item data</span>
        </GlassPanel>
      </section>
    );
  }

  if (detail.isError || !item) {
    return (
      <section className="view-stack" aria-labelledby="media-detail-error">
        <DetailBackButton onBack={onBack} returnLabel={returnLabel} />
        <GlassPanel className="empty-state">
          <Film aria-hidden="true" size={22} />
          <strong id="media-detail-error">Could not load media details</strong>
          <span>Try again from the library view</span>
        </GlassPanel>
      </section>
    );
  }

  const mediaSources = detail.data?.mediaSources ?? [];
  const playbackStatus =
    mediaSources.length > 0
      ? `${mediaSources.length} source ready`
      : item && containerPlaybackTypes.has(item.itemType)
        ? "Plays first available item"
        : canPlay
        ? "Source resolves on play"
        : "Not playable";
  const relatedItems = children.data?.items ?? [];
  const relatedColumns = getMediaGridColumns(relatedItems);
  const relatedOrientation = relatedItems[0]
    ? getMediaCardPresentation(relatedItems[0]).orientation
    : "landscape";

  async function handlePlay() {
    if (!item || !canPlay) {
      return;
    }

    setPlaybackError(null);
    try {
      const session = await openPlayback.mutateAsync({
        itemId: item.id,
        mediaSourceId: mediaSources[0]?.id ?? null,
        serverId,
      });
      setActiveSession(session);
    } catch (caught) {
      setPlaybackError(toAppError(caught));
    }
  }

  return (
    <section className="view-stack media-detail" aria-labelledby="media-title">
      <DetailBackButton onBack={onBack} returnLabel={returnLabel} />
      <CinematicHero
        actions={
          <>
            <MotionButton
              className="primary-action"
              disabled={!canPlay || openPlayback.isPending}
              onClick={handlePlay}
              type="button"
            >
              <Play aria-hidden="true" size={15} />
              <span>{openPlayback.isPending ? "Opening" : "Play"}</span>
            </MotionButton>
            <span className="status-chip">{playbackStatus}</span>
          </>
        }
        backdropUrl={item.backdropUrl ?? item.posterUrl ?? null}
        className="media-detail-hero"
        eyebrow={formatMetadata(item)}
        posterUrl={item.posterUrl}
        title={item.title}
        titleId="media-title"
      >
        <p>{item.overview ?? "No overview available."}</p>
      </CinematicHero>

      {playbackError ? (
        <GlassPanel className="form-error playback-error" role="alert">
          <strong>{playbackError.message}</strong>
          <span>{playbackError.code}</span>
        </GlassPanel>
      ) : null}

      <AnimatePresence initial={false}>
        {activeSession && activeSession.state !== "closed" ? (
          <PlayerControls
            key={activeSession.id}
            onSessionChange={setActiveSession}
            session={activeSession}
          />
        ) : null}
      </AnimatePresence>

      {shouldLoadChildren ? (
        <section className="media-rail" aria-labelledby="detail-children">
          <h2 id="detail-children">More from {item.title}</h2>
          {children.isError ? (
            <GlassPanel className="empty-state compact">
              <strong>Could not load related media</strong>
              <span>Try again later</span>
            </GlassPanel>
          ) : children.isLoading ? (
            <div className="rail-items" data-grid-orientation="portrait">
              {[0, 1, 2].map((slot) => (
                <PosterCard
                  focusScope="detail-children"
                  key={slot}
                  loading
                  orientation="portrait"
                />
              ))}
            </div>
          ) : relatedItems.length ? (
            <FocusScope
              aria-label={`More from ${item.title}`}
              className="rail-items"
              columns={relatedColumns}
              data-grid-orientation={relatedOrientation}
              entry
              focusKey={`${item.id}:${relatedItems
                .map((child) => child.id)
                .join(":")}`}
              scope="detail-children"
            >
              {relatedItems.map((child) => (
                <PosterCard
                  focusScope="detail-children"
                  item={child}
                  key={child.id}
                  onOpen={onOpenMedia}
                />
              ))}
            </FocusScope>
          ) : (
            <GlassPanel className="empty-state compact">
              <strong>No media found</strong>
              <span>{item.title}</span>
            </GlassPanel>
          )}
        </section>
      ) : null}
    </section>
  );
}

function toAppError(error: unknown): AppError {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error
  ) {
    return error as AppError;
  }

  return {
    code: "playback.unknown",
    message: "Playback could not be started",
    recoverable: true,
  };
}

type DetailBackButtonProps = {
  onBack: () => void;
  returnLabel: string;
};

function DetailBackButton({ onBack, returnLabel }: DetailBackButtonProps) {
  return (
    <MotionButton className="secondary-action back-action" onClick={onBack} type="button">
      <ChevronLeft aria-hidden="true" size={16} />
      <span>Back to {returnLabel}</span>
    </MotionButton>
  );
}
