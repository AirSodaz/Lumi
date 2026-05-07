import { TvMinimalPlay } from "lucide-react";
import { PosterCard } from "../../components/media";
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
  const secondLibrary = libraries[1] ?? null;
  const thirdLibrary = libraries[2] ?? null;
  const firstChildren = useChildren(firstLibrary ? server?.id : null, firstLibrary?.id ?? null);
  const secondChildren = useChildren(secondLibrary ? server?.id : null, secondLibrary?.id ?? null);
  const thirdChildren = useChildren(thirdLibrary ? server?.id : null, thirdLibrary?.id ?? null);
  const loading =
    serversLoading ||
    librariesLoading ||
    firstChildren.isLoading ||
    secondChildren.isLoading ||
    thirdChildren.isLoading;
  const mediaItems = [
    ...(firstChildren.data?.items ?? []),
    ...(secondChildren.data?.items ?? []),
    ...(thirdChildren.data?.items ?? []),
  ];
  const latest = mediaItems.slice(0, 10);
  const recommended = mediaItems.slice(10, 20);
  const hasServers = servers.length > 0;

  return (
    <section className="view-stack" aria-labelledby="home-title">
      <header className="view-header home-hero">
        <div>
          <p className="eyebrow">Lumi</p>
          <h1 id="home-title">Home</h1>
        </div>
        <div className="hero-action">
          {hasServers ? (
            <span className="status-chip">{servers.length} server connected</span>
          ) : (
            <button className="primary-action" onClick={onOpenSettings} type="button">
              Add Server
            </button>
          )}
        </div>
      </header>

      <section className="hero-band" aria-label="Featured playback">
        <div>
          <p className="eyebrow">Continue Watching</p>
          <h2>{server ? server.name : "Connect your Emby library"}</h2>
          <p className="muted">
            {server
              ? "Browse your saved server from Home or Libraries."
              : "Add a server from Settings to begin browsing."}
          </p>
        </div>
        <TvMinimalPlay aria-hidden="true" size={54} />
      </section>

      <MediaRail
        emptyText="Playback progress arrives in P7"
        items={[]}
        loading={false}
        onOpenMedia={onOpenMedia}
        title="Continue Watching"
      />
      <MediaRail
        emptyText={server ? "No media found" : "Connect a server first"}
        items={latest}
        loading={loading}
        onOpenMedia={onOpenMedia}
        title="Latest"
      />
      <MediaRail
        emptyText="More recommendations will appear as libraries grow"
        items={recommended}
        loading={loading && latest.length > 0}
        onOpenMedia={onOpenMedia}
        title="Recommended"
      />
    </section>
  );
}

type MediaRailProps = {
  emptyText: string;
  items: LibraryItem[];
  loading: boolean;
  onOpenMedia: (item: LibraryItem) => void;
  title: string;
};

function MediaRail({ emptyText, items, loading, onOpenMedia, title }: MediaRailProps) {
  return (
    <section className="media-rail" aria-labelledby={`${title}-rail`}>
      <h2 id={`${title}-rail`}>{title}</h2>
      {items.length > 0 ? (
        <div className="rail-items">
          {items.map((item) => (
            <PosterCard
              focusScope={`${title}-rail`}
              item={item}
              key={item.id}
              onOpen={onOpenMedia}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state compact">
          <strong>{loading ? "Loading media" : "No media found"}</strong>
          <span>{loading ? "Fetching library items" : emptyText}</span>
        </div>
      )}
    </section>
  );
}
