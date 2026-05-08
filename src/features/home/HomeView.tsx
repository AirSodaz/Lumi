import type { CSSProperties } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { motion, useReducedMotion } from "motion/react";
import { Check, ChevronDown, Info, Server } from "lucide-react";
import { MediaRail } from "../../components/media";
import { MotionButton } from "../../components/motion";
import { formatMetadata } from "../../lib/media/format";
import { createSurfaceMotion } from "../../lib/motion/presets";
import { dropdownMotion } from "../../lib/motion/presets";
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
            <ServerSelector
              onSelectServer={onSelectServer}
              selectedServer={server}
              servers={servers}
            />
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
