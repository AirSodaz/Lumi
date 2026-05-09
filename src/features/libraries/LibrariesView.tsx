import { ChevronLeft, Film, Library, type LucideIcon } from "lucide-react";
import { FocusScope } from "../../components/focus";
import { GlassPanel } from "../../components/layout";
import { PosterCard } from "../../components/media";
import { MotionButton } from "../../components/motion";
import { useI18n } from "../../lib/i18n";
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
  selectedServer: ServerProfile | null;
  servers: ServerProfile[];
};

export function LibrariesView({
  libraries,
  loading,
  onBackToHome,
  onOpenMedia,
  selectedLibraryId,
  selectedServer,
  servers,
}: LibrariesViewProps) {
  const { translate } = useI18n();
  const selectedLibrary =
    libraries.find((library) => library.id === selectedLibraryId) ?? null;
  const server = selectedServer ?? servers[0] ?? null;
  const children = useChildren(
    selectedLibrary ? server?.id : null,
    selectedLibrary?.id ?? null,
  );

  if (!selectedLibrary) {
    return (
      <section className="view-stack libraries-view app-workbench" aria-labelledby="library-title">
        <h1 className="sr-only" id="library-title">
          {translate("library.title.fallback")}
        </h1>
        <div className="browser-toolbar" aria-label={translate("library.aria.path")}>
          <MotionButton
            className="secondary-action"
            onClick={onBackToHome}
            type="button"
          >
            <ChevronLeft aria-hidden="true" size={16} />
            <span>{translate("library.action.backHome")}</span>
          </MotionButton>
        </div>

        <EmptyState
          icon={loading ? Film : Library}
          title={
            loading
              ? translate("library.empty.loading")
              : translate("library.empty.unavailable")
          }
          value={
            loading
              ? server?.name ?? translate("common.server")
              : translate("library.empty.returnHome")
          }
        />
      </section>
    );
  }

  return (
    <section className="view-stack libraries-view app-workbench" aria-labelledby="library-title">
      <h1 className="sr-only" id="library-title">{selectedLibrary.title}</h1>

      <div className="browser-toolbar" aria-label={translate("library.aria.path")}>
        <MotionButton
          className="secondary-action"
          onClick={onBackToHome}
          type="button"
        >
          <ChevronLeft aria-hidden="true" size={16} />
          <span>{translate("library.action.backHome")}</span>
        </MotionButton>
        <span className="breadcrumb-label">{translate("nav.home")}</span>
        <span aria-hidden="true" className="toolbar-divider">/</span>
        <strong>{selectedLibrary.title}</strong>
        <span className="status-chip">{server?.name ?? translate("common.server")}</span>
      </div>

      {children.isError ? (
        <EmptyState
          icon={Film}
          title={translate("library.empty.loadFailed")}
          value={translate("library.empty.tryAgain")}
        />
      ) : children.isLoading ? (
        <PosterGridLoading ariaLabel={translate("library.aria.loadingMedia")} orientation="portrait" />
      ) : children.data?.items.length ? (
        <PosterGrid
          ariaLabel={translate("library.aria.mediaIn", { title: selectedLibrary.title })}
          focusScope="library-children"
          items={children.data.items}
          onOpenMedia={onOpenMedia}
        />
      ) : (
        <EmptyState
          icon={Library}
          title={translate("media.rail.empty.noMedia")}
          value={selectedLibrary.title}
        />
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
  ariaLabel,
  orientation = "landscape",
}: {
  ariaLabel: string;
  orientation?: MediaCardOrientation;
}) {
  return (
    <div
      aria-label={ariaLabel}
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
