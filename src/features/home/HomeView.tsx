import type { CSSProperties } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Info, Server } from "lucide-react";
import { MediaRail } from "../../components/media";
import { MotionButton } from "../../components/motion";
import { formatMetadata } from "../../lib/media/format";
import { createSurfaceMotion } from "../../lib/motion/presets";
import {
  useHomeRows,
  type LibraryItem,
  type ServerProfile,
} from "../../lib/tauriClient";

type HomeViewProps = {
  libraries: LibraryItem[];
  librariesLoading: boolean;
  onOpenLibrary: (item: LibraryItem) => void;
  onOpenMedia: (item: LibraryItem) => void;
  onOpenSettings: () => void;
  servers: ServerProfile[];
  serversLoading: boolean;
};

export function HomeView({
  libraries,
  librariesLoading,
  onOpenLibrary,
  onOpenMedia,
  onOpenSettings,
  servers,
  serversLoading,
}: HomeViewProps) {
  const reducedMotion = useReducedMotion();
  const server = servers[0] ?? null;
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
  const featured = continueWatching[0] ?? firstLatest;
  const featuredTitle = featured?.title ?? (server ? server.name : "Connect your Emby library");
  const featuredDescription =
    featured?.overview ??
    (server
      ? "Browse your saved library from a compact media-first desktop surface."
      : "Add a server from Settings to begin browsing your media.");
  const featuredArtwork = featured?.backdropUrl ?? featured?.posterUrl ?? null;
  const featuredArtworkStyle = featuredArtwork
    ? ({ backgroundImage: `url("${featuredArtwork}")` } satisfies CSSProperties)
    : undefined;

  return (
    <section className="view-stack home-view app-workbench" aria-labelledby="home-title">
      <header className="workbench-header">
        <div className="workbench-title-block">
          <span className="workbench-kicker">{server?.name ?? "No server"}</span>
          <h1 id="home-title">Home</h1>
          <div className="workbench-meta-row">
            <span>
              {hasServers
                ? `${servers.length} server connected`
                : "Add an Emby server to browse"}
            </span>
            <span>
              {libraries.length > 0 ? `${libraries.length} libraries` : "Library waiting"}
            </span>
          </div>
        </div>
        <div className="toolbar-cluster">
          {server ? (
            <span className="status-chip">{server.name}</span>
          ) : (
            <MotionButton className="primary-action" onClick={onOpenSettings} type="button">
              <Server aria-hidden="true" size={15} />
              <span>Add Server</span>
            </MotionButton>
          )}
        </div>
      </header>

      <motion.section
        aria-labelledby="home-featured-title"
        className={`featured-shelf ${featuredArtwork ? "has-art" : ""}`.trim()}
        data-motion-surface="featured-shelf"
        {...createSurfaceMotion(reducedMotion, 0)}
      >
        <span aria-hidden="true" className="featured-art" style={featuredArtworkStyle} />
        <div className="featured-copy">
          <span className="workbench-kicker">{featured ? "Featured" : "Start"}</span>
          <h2 id="home-featured-title">{featuredTitle}</h2>
          <p>{featuredDescription}</p>
          <div className="featured-actions">
            {featured ? (
              <>
                <MotionButton
                  className="primary-action"
                  onClick={() => onOpenMedia(featured)}
                  type="button"
                >
                  <Info aria-hidden="true" size={15} />
                  <span>More Info</span>
                </MotionButton>
                <span className="status-chip">{formatMetadata(featured)}</span>
              </>
            ) : (
              <MotionButton className="primary-action" onClick={onOpenSettings} type="button">
                <Server aria-hidden="true" size={15} />
                <span>Add Server</span>
              </MotionButton>
            )}
          </div>
        </div>
      </motion.section>

      <MediaRail
        emptyText="Start watching and progress will appear here."
        entry={continueWatching.length > 0}
        items={continueWatching}
        loading={loading}
        onOpenMedia={onOpenMedia}
        showProgress
        title="Continue Watching"
      />
      <MediaRail
        cardSize="compact"
        emptyText={server ? "No libraries found" : "Connect a server first"}
        entry={continueWatching.length === 0 && libraries.length > 0}
        items={libraries}
        loading={loading}
        onOpenMedia={onOpenLibrary}
        orientation="landscape"
        title="Media Libraries"
      />
      {latestByLibrary.map(({ items, library }) => (
        <MediaRail
          emptyText={server ? "No latest media found" : "Connect a server first"}
          entry={false}
          items={items}
          key={library.id}
          loading={loading}
          onOpenMedia={onOpenMedia}
          title={`Latest in ${library.title}`}
        />
      ))}
    </section>
  );
}
