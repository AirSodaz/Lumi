import { Info, Server } from "lucide-react";
import { CinematicHero } from "../../components/layout";
import { MediaRail } from "../../components/media";
import { formatMetadata } from "../../lib/media/format";
import {
  useChildren,
  type LibraryItem,
  type ServerProfile,
} from "../../lib/tauriClient";

type HomeViewProps = {
  libraries: LibraryItem[];
  librariesLoading: boolean;
  onOpenMedia: (item: LibraryItem) => void;
  onOpenSettings: () => void;
  servers: ServerProfile[];
  serversLoading: boolean;
};

export function HomeView({
  libraries,
  librariesLoading,
  onOpenMedia,
  onOpenSettings,
  servers,
  serversLoading,
}: HomeViewProps) {
  const server = servers[0] ?? null;
  const firstLibrary = libraries[0] ?? null;
  const firstChildren = useChildren(firstLibrary ? server?.id : null, firstLibrary?.id ?? null);
  const loading =
    serversLoading ||
    librariesLoading ||
    firstChildren.isLoading;
  const mediaItems = firstChildren.data?.items ?? [];
  const latest = mediaItems.slice(0, 10);
  const hasServers = servers.length > 0;
  const featured = latest[0] ?? null;
  const heroTitle = featured?.title ?? (server ? server.name : "Connect your Emby library");
  const heroDescription =
    featured?.overview ??
    (server
      ? "Browse your saved library with a cinematic desktop shell."
      : "Add a server from Settings to begin browsing your media.");
  const heroBackdrop = featured?.backdropUrl ?? featured?.posterUrl ?? null;

  return (
    <section className="view-stack home-view" aria-labelledby="home-title">
      <h1 className="sr-only" id="home-title">Home</h1>
      <CinematicHero
        actions={
          featured ? (
            <>
              <button
                className="primary-action"
                onClick={() => onOpenMedia(featured)}
                type="button"
              >
                <Info aria-hidden="true" size={15} />
                <span>More Info</span>
              </button>
              <span className="status-chip">{server?.name ?? "Server"}</span>
            </>
          ) : (
            <button className="primary-action" onClick={onOpenSettings} type="button">
              <Server aria-hidden="true" size={15} />
              <span>Add Server</span>
            </button>
          )
        }
        backdropUrl={heroBackdrop}
        eyebrow={featured ? "Featured from Emby" : "Lumi"}
        metadata={
          featured ? (
            <span>{formatMetadata(featured)}</span>
          ) : (
            <span>{hasServers ? `${servers.length} server connected` : "Emby-first desktop library"}</span>
          )
        }
        title={heroTitle}
      >
        <p>{heroDescription}</p>
      </CinematicHero>

      <MediaRail
        emptyText="Start watching and progress will appear here."
        entry={false}
        items={[]}
        loading={false}
        onOpenMedia={onOpenMedia}
        title="Continue Watching"
      />
      <MediaRail
        emptyText={server ? "No media found" : "Connect a server first"}
        entry
        items={latest}
        loading={loading}
        onOpenMedia={onOpenMedia}
        title="Latest"
      />
      <MediaRail
        emptyText="Recommendations will appear after Lumi learns your library."
        entry={false}
        items={[]}
        loading={false}
        onOpenMedia={onOpenMedia}
        title="Recommended"
      />
    </section>
  );
}
