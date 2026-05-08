import { ChevronLeft, Film, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { FocusScope } from "../../components/focus";
import { CinematicHero, GlassPanel } from "../../components/layout";
import { PosterCard } from "../../components/media";
import { MotionButton } from "../../components/motion";
import { useI18n } from "../../lib/i18n";
import { formatMetadata } from "../../lib/media/format";
import {
  getMediaCardPresentation,
  getMediaGridColumns,
} from "../../lib/media/presentation";
import {
  useChildren,
  useItemDetail,
  useOpenPlayback,
  playback,
  playbackEventToAppError,
  type AppError,
  type LibraryItem,
  type PlayerSession,
} from "../../lib/tauriClient";

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
  const { locale, translate } = useI18n();
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

  useEffect(() => {
    const unlistenTasks = [
      playback.onStateChanged((session) => {
        setActiveSession((current) =>
          current?.id === session.id ? session : current,
        );
        if (session.state !== "error") {
          setPlaybackError(null);
        }
      }),
      playback.onPosition((event) => {
        setActiveSession((current) =>
          current?.id === event.sessionId
            ? { ...current, positionSeconds: event.positionSeconds }
            : current,
        );
      }),
      playback.onError((event) => {
        setActiveSession((current) => {
          if (event.sessionId && current?.id !== event.sessionId) {
            return current;
          }

          setPlaybackError(playbackEventToAppError(event));
          return current ? { ...current, state: "error" } : current;
        });
      }),
    ];

    return () => {
      void Promise.all(unlistenTasks).then((unlisteners) => {
        unlisteners.forEach((unlisten) => unlisten());
      });
    };
  }, []);

  if (detail.isLoading) {
    return (
      <section className="view-stack" aria-labelledby="media-detail-loading">
        <DetailBackButton onBack={onBack} returnLabel={returnLabel} />
        <GlassPanel className="empty-state">
          <Film aria-hidden="true" size={22} />
          <strong id="media-detail-loading">
            {translate("viewDetail.empty.loadingTitle")}
          </strong>
          <span>{translate("viewDetail.empty.loadingSubtitle")}</span>
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
          <strong id="media-detail-error">
            {translate("viewDetail.empty.loadItemFailed")}
          </strong>
          <span>{translate("viewDetail.empty.tryFromLibrary")}</span>
        </GlassPanel>
      </section>
    );
  }

  const mediaSources = detail.data?.mediaSources ?? [];
  const playbackStatus =
    mediaSources.length > 0
      ? translate("viewDetail.playback.sourceReady", {
          count: mediaSources.length,
        })
      : item && containerPlaybackTypes.has(item.itemType)
        ? translate("viewDetail.playback.container")
        : canPlay
          ? translate("viewDetail.playback.sourceOnPlay")
          : translate("viewDetail.playback.notPlayable");
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
      setPlaybackError(toAppError(caught, translate("viewDetail.playback.startFailed")));
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
              <span>
                {openPlayback.isPending
                  ? translate("player.state.opening")
                  : translate("viewDetail.action.play")}
              </span>
            </MotionButton>
            <span className="status-chip">{playbackStatus}</span>
          </>
        }
        backdropUrl={item.backdropUrl ?? item.posterUrl ?? null}
        className="media-detail-hero"
        eyebrow={formatMetadata(item, locale)}
        posterUrl={item.posterUrl}
        title={item.title}
        titleId="media-title"
      >
        <p>{item.overview ?? translate("viewDetail.empty.noOverview")}</p>
      </CinematicHero>

      {playbackError ? (
        <GlassPanel className="form-error playback-error" role="alert">
          <strong>{playbackError.message}</strong>
          <span>{playbackError.code}</span>
        </GlassPanel>
      ) : null}

      {activeSession && activeSession.state === "opening" ? (
        <GlassPanel className="playback-opening" aria-live="polite">
          <strong>{translate("player.state.opening")}</strong>
          <span>{translate("viewDetail.playback.openingSubtitle")}</span>
        </GlassPanel>
      ) : null}

      {shouldLoadChildren ? (
        <section className="media-rail" aria-labelledby="detail-children">
          <h2 id="detail-children">
            {translate("viewDetail.related.title", { title: item.title })}
          </h2>
          {children.isError ? (
            <GlassPanel className="empty-state compact">
              <strong>{translate("viewDetail.empty.loadRelatedFailed")}</strong>
              <span>{translate("library.empty.tryAgain")}</span>
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
              aria-label={translate("viewDetail.related.aria", { title: item.title })}
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
              <strong>{translate("media.rail.empty.noMedia")}</strong>
              <span>{item.title}</span>
            </GlassPanel>
          )}
        </section>
      ) : null}
    </section>
  );
}

function toAppError(error: unknown, fallbackMessage: string): AppError {
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
    message: fallbackMessage,
    recoverable: true,
  };
}

type DetailBackButtonProps = {
  onBack: () => void;
  returnLabel: string;
};

function DetailBackButton({ onBack, returnLabel }: DetailBackButtonProps) {
  const { translate } = useI18n();

  return (
    <MotionButton className="secondary-action back-action" onClick={onBack} type="button">
      <ChevronLeft aria-hidden="true" size={16} />
      <span>{translate("viewDetail.action.backTo", { label: returnLabel })}</span>
    </MotionButton>
  );
}
