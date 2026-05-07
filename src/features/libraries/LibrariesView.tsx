import { ChevronLeft, Film, Library, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { FocusScope } from "../../components/focus";
import { PosterCard } from "../../components/media";
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
      <section className="view-stack" aria-labelledby="library-title">
        <header className="view-header">
          <div>
            <p className="eyebrow">{server?.name ?? "No server"}</p>
            <h1 id="library-title">{selectedLibrary.title}</h1>
          </div>
          <button
            className="secondary-action"
            onClick={() => setSelectedLibrary(null)}
            type="button"
          >
            <ChevronLeft aria-hidden="true" size={18} />
            <span>Back to Libraries</span>
          </button>
        </header>

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
    <section className="view-stack" aria-labelledby="libraries-title">
      <header className="view-header">
        <div>
          <p className="eyebrow">{server?.name ?? "No server"}</p>
          <h1 id="libraries-title">Libraries</h1>
        </div>
      </header>

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
    <div className="empty-state">
      <IconComponent aria-hidden="true" size={28} />
      <strong>{title}</strong>
      <span>{value}</span>
    </div>
  );
}
