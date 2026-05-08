import { useEffect, useMemo, useRef } from "react";
import { Film, Server, Star } from "lucide-react";
import { FocusScope } from "../../components/focus";
import { GlassPanel } from "../../components/layout";
import { PosterCard } from "../../components/media";
import { useI18n } from "../../lib/i18n";
import {
  getMediaCardPresentation,
  getMediaGridColumns,
} from "../../lib/media/presentation";
import {
  useFavorites,
  type LibraryItem,
  type ServerProfile,
} from "../../lib/tauriClient";

type FavoritesViewProps = {
  onOpenMedia: (item: LibraryItem) => void;
  selectedServer: ServerProfile | null;
  serversLoading: boolean;
};

export function FavoritesView({
  onOpenMedia,
  selectedServer,
  serversLoading,
}: FavoritesViewProps) {
  const { translate } = useI18n();
  const favorites = useFavorites(selectedServer?.id);
  const items = useMemo(
    () => favorites.data?.pages.flatMap((page) => page.items) ?? [],
    [favorites.data],
  );
  const favoriteCount = items.length;
  const status = favorites.isLoading
    ? translate("library.meta.syncing")
    : favoriteCount > 0
      ? translate("library.meta.items", { count: favoriteCount })
      : translate("common.ready");

  return (
    <section className="view-stack favorites-view app-workbench" aria-labelledby="favorites-title">
      <header className="workbench-header">
        <div className="workbench-title-block">
          <span className="workbench-kicker">
            {selectedServer?.name ?? translate("home.meta.noServer")}
          </span>
          <h1 id="favorites-title">{translate("nav.favorites")}</h1>
          <div className="workbench-meta-row">
            <span>{translate("favorites.meta.embyFavorites")}</span>
            <span>{serversLoading ? translate("favorites.loading.server") : status}</span>
          </div>
        </div>
      </header>

      {!selectedServer ? (
        <FavoritesEmpty
          icon={Server}
          title={
            serversLoading
              ? translate("favorites.loading.server")
              : translate("favorites.empty.noServerTitle")
          }
          value={
            serversLoading
              ? translate("favorites.status.checkingServers")
              : translate("favorites.empty.noServerDescription")
          }
        />
      ) : favorites.isError ? (
        <FavoritesEmpty
          icon={Film}
          title={translate("favorites.empty.loadFailed")}
          value={translate("library.empty.tryAgain")}
        />
      ) : favorites.isLoading ? (
        <PosterGridLoading />
      ) : items.length > 0 ? (
        <>
          <FavoritesGrid items={items} onOpenMedia={onOpenMedia} />
          <FavoritesLoadSentinel
            hasNextPage={favorites.hasNextPage}
            isFetchingNextPage={favorites.isFetchingNextPage}
            onLoadMore={() => void favorites.fetchNextPage()}
          />
        </>
      ) : (
        <FavoritesEmpty
          icon={Star}
          title={translate("favorites.empty.title")}
          value={translate("favorites.empty.description")}
        />
      )}
    </section>
  );
}

type FavoritesGridProps = {
  items: LibraryItem[];
  onOpenMedia: (item: LibraryItem) => void;
};

function FavoritesGrid({ items, onOpenMedia }: FavoritesGridProps) {
  const { translate } = useI18n();
  const columns = getMediaGridColumns(items);
  const gridOrientation = items[0]
    ? getMediaCardPresentation(items[0]).orientation
    : "landscape";

  return (
    <FocusScope
      aria-label={translate("favorites.aria.media")}
      className="library-grid"
      columns={columns}
      data-grid-orientation={gridOrientation}
      entry
      focusKey={items.map((item) => item.id).join(":")}
      scope="favorites-grid"
    >
      {items.map((item) => (
        <PosterCard
          focusScope="favorites-grid"
          item={item}
          key={item.id}
          onOpen={onOpenMedia}
        />
      ))}
    </FocusScope>
  );
}

function FavoritesLoadSentinel({
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}) {
  const { translate } = useI18n();
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = sentinelRef.current;

    if (!element || !hasNextPage || isFetchingNextPage) {
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      onLoadMore();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoadMore();
        }
      },
      { rootMargin: "360px" },
    );
    observer.observe(element);

    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, onLoadMore]);

  if (!hasNextPage && !isFetchingNextPage) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      className="favorites-load-sentinel"
      ref={sentinelRef}
    >
      {isFetchingNextPage
        ? translate("favorites.loading.more")
        : translate("favorites.more")}
    </div>
  );
}

function PosterGridLoading() {
  const { translate } = useI18n();

  return (
    <div
      aria-label={translate("favorites.loading.aria")}
      className="library-grid"
      data-grid-orientation="portrait"
    >
      {[0, 1, 2, 3, 4].map((slot) => (
        <PosterCard
          focusScope="loading-favorites"
          key={slot}
          loading
          orientation="portrait"
        />
      ))}
    </div>
  );
}

type FavoritesEmptyProps = {
  icon: typeof Star;
  title: string;
  value: string;
};

function FavoritesEmpty({ icon: IconComponent, title, value }: FavoritesEmptyProps) {
  return (
    <GlassPanel className="empty-state">
      <IconComponent aria-hidden="true" size={22} />
      <strong>{title}</strong>
      <span>{value}</span>
    </GlassPanel>
  );
}
