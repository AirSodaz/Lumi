import { ChevronLeft, Film, Library, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { FocusScope } from "../../components/focus";
import { CinematicHero, GlassPanel } from "../../components/layout";
import { PosterCard } from "../../components/media";
import { MotionButton } from "../../components/motion";
import { formatMetadata } from "../../lib/media/format";
import {
  useChildren,
  type LibraryItem,
  type ServerProfile,
} from "../../lib/tauriClient";

type LibrariesViewProps = {
  libraries: LibraryItem[];
  loading: boolean;
  onOpenMedia: (item: LibraryItem) => void;
  servers: ServerProfile[];
};

export function LibrariesView({
  libraries,
  loading,
  onOpenMedia,
  servers,
}: LibrariesViewProps) {
  const [selectedLibrary, setSelectedLibrary] = useState<LibraryItem | null>(null);
  const server = servers[0] ?? null;
  const children = useChildren(
    selectedLibrary ? server?.id : null,
    selectedLibrary?.id ?? null,
  );

  if (selectedLibrary) {
    return (
      <section className="view-stack libraries-view" aria-labelledby="library-title">
        <CinematicHero
          actions={
            <MotionButton
              className="secondary-action"
              onClick={() => setSelectedLibrary(null)}
              type="button"
            >
              <ChevronLeft aria-hidden="true" size={16} />
              <span>Back to Libraries</span>
            </MotionButton>
          }
          backdropUrl={selectedLibrary.backdropUrl ?? selectedLibrary.posterUrl ?? null}
          eyebrow={server?.name ?? "No server"}
          metadata={<span>{formatMetadata(selectedLibrary)}</span>}
          posterUrl={selectedLibrary.posterUrl}
          title={selectedLibrary.title}
          titleId="library-title"
        >
          <p>Browse this library with keyboard, controller, or pointer focus.</p>
        </CinematicHero>

        {children.isError ? (
          <EmptyState icon={Film} title="Could not load media" value="Try again later" />
        ) : children.isLoading ? (
          <PosterGridLoading />
        ) : children.data?.items.length ? (
          <PosterGrid
            focusScope="library-children"
            items={children.data.items}
            onOpenMedia={onOpenMedia}
          />
        ) : (
          <EmptyState icon={Library} title="No media found" value={selectedLibrary.title} />
        )}
      </section>
    );
  }

  return (
    <section className="view-stack libraries-view" aria-labelledby="libraries-title">
      <CinematicHero
        eyebrow={server?.name ?? "No server"}
        metadata={<span>{libraries.length > 0 ? `${libraries.length} libraries` : "Library browser"}</span>}
        title="Libraries"
        titleId="libraries-title"
      >
        <p>Choose a media library and continue into your movies, shows, seasons, and collections.</p>
      </CinematicHero>

      {servers.length === 0 ? (
        <EmptyState icon={Library} title="No servers connected" value="Add a server in Settings" />
      ) : loading ? (
        <EmptyState icon={Film} title="Loading libraries" value={server?.name ?? "Server"} />
      ) : libraries.length === 0 ? (
        <EmptyState icon={Library} title="No libraries found" value={server?.name ?? "Server"} />
      ) : (
        <PosterGrid
          focusScope="library-grid"
          items={libraries}
          onOpenMedia={setSelectedLibrary}
        />
      )}
    </section>
  );
}

type PosterGridProps = {
  focusScope: string;
  items: LibraryItem[];
  onOpenMedia: (item: LibraryItem) => void;
};

function PosterGrid({ focusScope, items, onOpenMedia }: PosterGridProps) {
  return (
    <FocusScope
      aria-label="Media libraries"
      className="library-grid"
      columns={3}
      entry
      focusKey={items.map((item) => item.id).join(":")}
      scope={focusScope}
    >
      {items.map((item) => (
        <PosterCard
          focusScope={focusScope}
          item={item}
          key={item.id}
          onOpen={onOpenMedia}
        />
      ))}
    </FocusScope>
  );
}

function PosterGridLoading() {
  return (
    <div className="library-grid" aria-label="Loading media">
      {[0, 1, 2].map((slot) => (
        <PosterCard focusScope="loading-media" key={slot} loading />
      ))}
    </div>
  );
}

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  value: string;
};

function EmptyState({ icon: IconComponent, title, value }: EmptyStateProps) {
  return (
    <GlassPanel className="empty-state">
      <IconComponent aria-hidden="true" size={22} />
      <strong>{title}</strong>
      <span>{value}</span>
    </GlassPanel>
  );
}
