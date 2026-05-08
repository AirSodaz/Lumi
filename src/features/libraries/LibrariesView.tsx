import { ChevronLeft, Film, Library, type LucideIcon } from "lucide-react";
import { FocusScope } from "../../components/focus";
import { GlassPanel } from "../../components/layout";
import { PosterCard } from "../../components/media";
import { MotionButton } from "../../components/motion";
import { formatMetadata } from "../../lib/media/format";
import {
  getMediaCardPresentation,
  getMediaGridColumns,
  type MediaCardOrientation,
} from "../../lib/media/presentation";
import {
  useChildren,
  type LibraryItem,
  type ServerProfile,
} from "../../lib/tauriClient";

type LibrariesViewProps = {
  libraries: LibraryItem[];
  loading: boolean;
  onBackToHome: () => void;
  onOpenMedia: (item: LibraryItem) => void;
  selectedLibraryId: string;
  servers: ServerProfile[];
};

export function LibrariesView({
  libraries,
  loading,
  onBackToHome,
  onOpenMedia,
  selectedLibraryId,
  servers,
}: LibrariesViewProps) {
  const selectedLibrary =
    libraries.find((library) => library.id === selectedLibraryId) ?? null;
  const server = servers[0] ?? null;
  const children = useChildren(
    selectedLibrary ? server?.id : null,
    selectedLibrary?.id ?? null,
  );

  if (!selectedLibrary) {
    return (
      <section className="view-stack libraries-view app-workbench" aria-labelledby="library-title">
        <header className="workbench-header">
          <div className="workbench-title-block">
            <span className="workbench-kicker">{server?.name ?? "No server"}</span>
            <h1 id="library-title">Media Library</h1>
            <div className="workbench-meta-row">
              <span>{loading ? "Syncing" : "Unavailable"}</span>
              <span>{server?.name ?? "Server"}</span>
            </div>
          </div>
          <div className="toolbar-cluster">
            <MotionButton
              className="secondary-action"
              onClick={onBackToHome}
              type="button"
            >
              <ChevronLeft aria-hidden="true" size={16} />
              <span>Back to Home</span>
            </MotionButton>
          </div>
        </header>

        <EmptyState
          icon={loading ? Film : Library}
          title={loading ? "Loading library" : "Library unavailable"}
          value={loading ? server?.name ?? "Server" : "Return Home and choose a library"}
        />
      </section>
    );
  }

  const childCount = children.data?.items.length ?? 0;
  const childStatus = children.isLoading
    ? "Loading"
    : childCount > 0
      ? `${childCount} items`
      : "Library browser";

  return (
    <section className="view-stack libraries-view app-workbench" aria-labelledby="library-title">
      <header className="workbench-header">
        <div className="workbench-title-block">
          <span className="workbench-kicker">{server?.name ?? "No server"}</span>
          <h1 id="library-title">{selectedLibrary.title}</h1>
          <div className="workbench-meta-row">
            <span>{formatMetadata(selectedLibrary)}</span>
            <span>{childStatus}</span>
          </div>
        </div>
        <div className="toolbar-cluster">
          <MotionButton
            className="secondary-action"
            onClick={onBackToHome}
            type="button"
          >
            <ChevronLeft aria-hidden="true" size={16} />
            <span>Back to Home</span>
          </MotionButton>
        </div>
      </header>

      <div className="browser-toolbar" aria-label="Library path">
        <span className="breadcrumb-label">Home</span>
        <span aria-hidden="true" className="toolbar-divider">/</span>
        <strong>{selectedLibrary.title}</strong>
        <span className="status-chip">{server?.name ?? "Server"}</span>
      </div>

      {children.isError ? (
        <EmptyState icon={Film} title="Could not load media" value="Try again later" />
      ) : children.isLoading ? (
        <PosterGridLoading orientation="portrait" />
      ) : children.data?.items.length ? (
        <PosterGrid
          ariaLabel={`Media in ${selectedLibrary.title}`}
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

type PosterGridProps = {
  ariaLabel: string;
  focusScope: string;
  items: LibraryItem[];
  onOpenMedia: (item: LibraryItem) => void;
};

function PosterGrid({ ariaLabel, focusScope, items, onOpenMedia }: PosterGridProps) {
  const columns = getMediaGridColumns(items);
  const gridOrientation = items[0]
    ? getMediaCardPresentation(items[0]).orientation
    : "landscape";

  return (
    <FocusScope
      aria-label={ariaLabel}
      className="library-grid"
      columns={columns}
      data-grid-orientation={gridOrientation}
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

function PosterGridLoading({
  orientation = "landscape",
}: {
  orientation?: MediaCardOrientation;
}) {
  return (
    <div
      aria-label="Loading media"
      className="library-grid"
      data-grid-orientation={orientation}
    >
      {[0, 1, 2].map((slot) => (
        <PosterCard
          focusScope="loading-media"
          key={slot}
          loading
          orientation={orientation}
        />
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
