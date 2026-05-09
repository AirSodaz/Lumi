import { useEffect, useState, type CSSProperties } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { motion, useReducedMotion } from "motion/react";
import { Check, ChevronDown, Server } from "lucide-react";
import { MediaRail } from "../../components/media";
import { MotionButton } from "../../components/motion";
import { useI18n } from "../../lib/i18n";
import { formatMetadata } from "../../lib/media/format";
import { createSurfaceMotion } from "../../lib/motion/presets";
import { dropdownMotion } from "../../lib/motion/presets";
import {
  useHomeRows,
  type LibraryItem,
  type ServerProfile,
} from "../../lib/tauriClient";

const FEATURED_CAROUSEL_INTERVAL_MS = 8_000;
const EMPTY_FEATURED_ITEMS: LibraryItem[] = [];

type FeaturedArtworkStyle = CSSProperties & {
  "--featured-artwork": string;
};

type HomeViewProps = {
  libraries: LibraryItem[];
  librariesLoading: boolean;
  onOpenLibrary: (item: LibraryItem) => void;
  onOpenMedia: (item: LibraryItem) => void;
  onOpenSettings: () => void;
  onSelectServer: (serverId: string) => void;
  selectedServer: ServerProfile | null;
  servers: ServerProfile[];
  serversLoading: boolean;
};

export function HomeView({
  libraries,
  librariesLoading,
  onOpenLibrary,
  onOpenMedia,
  onOpenSettings,
  onSelectServer,
  selectedServer,
  servers,
  serversLoading,
}: HomeViewProps) {
  const reducedMotion = useReducedMotion();
  const prefersReducedMotion = usePrefersReducedMotion();
  const { locale, translate } = useI18n();
  const server = selectedServer;
  const libraryIds = libraries.map((library) => library.id);
  const homeRows = useHomeRows(server?.id, libraryIds);
  const loading =
    serversLoading ||
    librariesLoading ||
    homeRows.isLoading;
  const continueWatching = homeRows.data?.continueWatching ?? [];
  const latestByLibrary = libraries.map((library) => ({
    items:
      homeRows.data?.latestByLibrary.find((row) => row.libraryId === library.id)
        ?.items ?? [],
    library,
  }));
  const firstLatest = latestByLibrary.find((row) => row.items.length > 0)?.items[0] ?? null;
  const hasServers = servers.length > 0;
  const randomFeaturedItems = homeRows.data?.featuredItems ?? EMPTY_FEATURED_ITEMS;
  const fallbackFeatured = continueWatching[0] ?? firstLatest;
  const featuredItems = randomFeaturedItems.length > 0
    ? randomFeaturedItems
    : fallbackFeatured
      ? [fallbackFeatured]
      : EMPTY_FEATURED_ITEMS;
  const [selectedFeaturedId, setSelectedFeaturedId] = useState<string | null>(null);
  const canCycleFeatured = featuredItems.length > 1;
  const selectedFeaturedIndex = selectedFeaturedId
    ? featuredItems.findIndex((item) => item.id === selectedFeaturedId)
    : -1;
  const featuredIndex = selectedFeaturedIndex >= 0 ? selectedFeaturedIndex : 0;
  const nextFeaturedId = canCycleFeatured
    ? featuredItems[(featuredIndex + 1) % featuredItems.length]?.id ?? null
    : null;
  const featured = featuredItems[featuredIndex] ?? featuredItems[0] ?? null;
  const featuredTitle =
    featured?.title ??
    (server ? server.name : translate("home.featured.connectTitle"));
  const featuredDescription =
    featured?.overview ??
    (server
      ? translate("home.featured.connectedDescription")
      : translate("home.featured.connectDescription"));
  const featuredArtwork = featured?.backdropUrl ?? featured?.posterUrl ?? null;
  const featuredArtworkStyle = featuredArtwork
    ? ({
        "--featured-artwork": `url("${featuredArtwork}")`,
        backgroundImage: `url("${featuredArtwork}")`,
      } satisfies FeaturedArtworkStyle)
    : undefined;

  useEffect(() => {
    if (prefersReducedMotion || !canCycleFeatured) {
      return;
    }

    const timer = window.setInterval(() => {
      setSelectedFeaturedId(nextFeaturedId);
    }, FEATURED_CAROUSEL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [canCycleFeatured, nextFeaturedId, prefersReducedMotion]);

  return (
    <section className="view-stack home-view app-workbench" aria-labelledby="home-title">
      <header className="workbench-header">
        <div className="workbench-title-block">
          <span className="workbench-kicker">
            {server?.name ?? translate("home.meta.noServer")}
          </span>
          <h1 id="home-title">{translate("nav.home")}</h1>
          <div className="workbench-meta-row">
            <span>
              {hasServers
                ? translate("home.meta.serverConnected", { count: servers.length })
                : translate("home.meta.addServer")}
            </span>
            <span>
              {libraries.length > 0
                ? translate("home.meta.libraries", { count: libraries.length })
                : translate("home.meta.libraryWaiting")}
            </span>
          </div>
        </div>
        <div className="toolbar-cluster">
          {server ? (
            <ServerSelector
              onSelectServer={onSelectServer}
              selectedServer={server}
              servers={servers}
            />
          ) : (
            <MotionButton className="primary-action" onClick={onOpenSettings} type="button">
              <Server aria-hidden="true" size={15} />
              <span>{translate("home.action.addServer")}</span>
            </MotionButton>
          )}
        </div>
      </header>

      <motion.div
        aria-labelledby="home-featured-title"
        className={`featured-hero ${featuredArtwork ? "has-art" : ""}`.trim()}
        data-motion-surface="featured-hero"
        key={featured?.id ?? "empty-featured"}
        style={featuredArtworkStyle}
        {...createSurfaceMotion(reducedMotion, 0)}
      >
        {featured ? (
          <button
            aria-label={featuredTitle}
            className="featured-hero-button"
            onClick={() => onOpenMedia(featured)}
            type="button"
          >
            <span className="featured-copy">
              <span className="workbench-kicker">{translate("home.featured.featured")}</span>
              <span className="featured-title-wrap">
                {featured.logoUrl ? (
                  <img
                    alt={featuredTitle}
                    className="featured-title-logo"
                    src={featured.logoUrl}
                  />
                ) : null}
                <h2
                  className={featured.logoUrl ? "sr-only" : "featured-title-text"}
                  id="home-featured-title"
                >
                  {featuredTitle}
                </h2>
              </span>
              <span className="featured-meta">{formatMetadata(featured, locale)}</span>
              <span className="featured-description">{featuredDescription}</span>
            </span>
          </button>
        ) : (
          <div className="featured-hero-empty">
            <div className="featured-copy">
              <span className="workbench-kicker">{translate("home.featured.start")}</span>
              <h2 className="featured-title-text" id="home-featured-title">
                {featuredTitle}
              </h2>
              <p className="featured-description">{featuredDescription}</p>
              <MotionButton className="primary-action" onClick={onOpenSettings} type="button">
                <Server aria-hidden="true" size={15} />
                <span>{translate("home.action.addServer")}</span>
              </MotionButton>
            </div>
          </div>
        )}
        {canCycleFeatured ? (
          <div
            aria-label={translate("home.featured.carouselControls")}
            className="featured-carousel-dots"
          >
            {featuredItems.map((item, index) => (
              <button
                aria-label={translate("home.featured.showItem", {
                  title: item.title,
                })}
                aria-pressed={index === featuredIndex}
                className="featured-carousel-dot"
                key={item.id}
                onClick={() => setSelectedFeaturedId(item.id)}
                type="button"
              />
            ))}
          </div>
        ) : null}
      </motion.div>

      <MediaRail
        emptyText={translate("home.empty.continueWatching")}
        entry={continueWatching.length > 0}
        items={continueWatching}
        loading={loading}
        onOpenMedia={onOpenMedia}
        showProgress
        title={translate("home.rail.continueWatching")}
      />
      <MediaRail
        cardSize="compact"
        emptyText={
          server
            ? translate("home.empty.noLibraries")
            : translate("home.empty.connectServerFirst")
        }
        entry={continueWatching.length === 0 && libraries.length > 0}
        items={libraries}
        loading={loading}
        onOpenMedia={onOpenLibrary}
        orientation="landscape"
        title={translate("home.rail.mediaLibraries")}
      />
      {latestByLibrary.map(({ items, library }) => (
        <MediaRail
          emptyText={
            server
              ? translate("home.empty.noLatestMedia")
              : translate("home.empty.connectServerFirst")
          }
          entry={false}
          items={items}
          key={library.id}
          loading={loading}
          onOpenMedia={onOpenMedia}
          title={translate("home.rail.latestIn", { title: library.title })}
        />
      ))}
    </section>
  );
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() =>
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }

    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(query.matches);
    updatePreference();
    query.addEventListener?.("change", updatePreference);

    return () => {
      query.removeEventListener?.("change", updatePreference);
    };
  }, []);

  return prefersReducedMotion;
}

type ServerSelectorProps = {
  onSelectServer: (serverId: string) => void;
  selectedServer: ServerProfile;
  servers: ServerProfile[];
};

function ServerSelector({
  onSelectServer,
  selectedServer,
  servers,
}: ServerSelectorProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <MotionButton
          aria-label={selectedServer.name}
          className="server-selector-trigger"
          type="button"
        >
          <Server aria-hidden="true" size={15} />
          <span>{selectedServer.name}</span>
          <ChevronDown aria-hidden="true" size={14} />
        </MotionButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" asChild>
          <motion.div
            className="dropdown-content server-selector-menu"
            data-motion-surface="dropdown"
            {...dropdownMotion}
          >
            {servers.map((server) => (
              <DropdownMenu.Item
                aria-current={server.id === selectedServer.id ? "true" : undefined}
                className="dropdown-item server-selector-item"
                key={server.id}
                onSelect={() => onSelectServer(server.id)}
              >
                <span className="server-selector-check">
                  {server.id === selectedServer.id ? (
                    <Check aria-hidden="true" size={14} />
                  ) : null}
                </span>
                <span>
                  <strong>{server.name}</strong>
                  <small>{server.baseUrl}</small>
                </span>
              </DropdownMenu.Item>
            ))}
          </motion.div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
