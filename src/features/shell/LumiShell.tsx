import {
  Home,
  Library,
  type LucideIcon,
  Search,
  Settings,
} from "lucide-react";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { FocusableCard } from "../../components/focus";
import {
  directionFromKey,
  focusElement,
  focusFirstContentEntry,
  isAtScopeBoundary,
  shouldIgnoreDirectionalKeyTarget,
} from "../../components/focus/directionalFocus";
import {
  useLibraries,
  useServers,
  type LibraryItem,
} from "../../lib/tauriClient";
import { HomeView } from "../home/HomeView";
import { LibrariesView } from "../libraries/LibrariesView";
import { MediaDetailView } from "../media-detail/MediaDetailView";
import { SettingsView } from "../settings/SettingsView";

type ViewId = "home" | "libraries" | "search" | "settings";
type ReturnView = "home" | "libraries";
type Icon = LucideIcon;

type ShellRoute =
  | { kind: "view"; view: ViewId }
  | { itemId: string; kind: "mediaDetail"; returnView: ReturnView; serverId: string };

const navItems: Array<{ id: ViewId; label: string; icon: Icon }> = [
  { id: "home", label: "Home", icon: Home },
  { id: "libraries", label: "Libraries", icon: Library },
  { id: "search", label: "Search", icon: Search },
  { id: "settings", label: "Settings", icon: Settings },
];

export function LumiShell() {
  const [route, setRoute] = useState<ShellRoute>({ kind: "view", view: "home" });
  const serversQuery = useServers();
  const servers = serversQuery.data ?? [];
  const selectedServerId = servers[0]?.id ?? null;
  const librariesQuery = useLibraries(selectedServerId);
  const libraries = librariesQuery.data ?? [];
  const activeView = route.kind === "mediaDetail" ? route.returnView : route.view;

  function openMediaDetail(item: LibraryItem, returnView: ReturnView) {
    setRoute({
      itemId: item.id,
      kind: "mediaDetail",
      returnView,
      serverId: item.serverId,
    });
  }

  function focusActiveNavigation() {
    const activeNavigation = document.querySelector<HTMLButtonElement>(
      '[data-shell-nav-active="true"]',
    );

    if (!activeNavigation) {
      return false;
    }

    focusElement(activeNavigation);
    return true;
  }

  function handleContentKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (
      event.defaultPrevented ||
      shouldIgnoreDirectionalKeyTarget(event.target)
    ) {
      return;
    }

    const direction = directionFromKey(event.key);
    if (direction !== "left") {
      return;
    }

    const target = event.target instanceof HTMLElement ? event.target : null;
    const focusable = target?.closest<HTMLButtonElement>("[data-focus-scope]");
    const scope = focusable?.dataset.focusScope;

    if (
      focusable &&
      scope &&
      isAtScopeBoundary(scope, focusable, direction) &&
      focusActiveNavigation()
    ) {
      event.preventDefault();
    }
  }

  let currentView: ReactNode;

  if (route.kind === "mediaDetail") {
    currentView = (
      <MediaDetailView
        itemId={route.itemId}
        onBack={() => setRoute({ kind: "view", view: route.returnView })}
        onOpenMedia={(item) => openMediaDetail(item, route.returnView)}
        returnLabel={route.returnView === "home" ? "Home" : "Libraries"}
        serverId={route.serverId}
      />
    );
  } else {
    switch (route.view) {
      case "libraries":
        currentView = (
          <LibrariesView
            libraries={libraries}
            loading={librariesQuery.isLoading}
            onOpenMedia={(item) => openMediaDetail(item, "libraries")}
            servers={servers}
          />
        );
        break;
      case "search":
        currentView = <SearchView />;
        break;
      case "settings":
        currentView = <SettingsView />;
        break;
      case "home":
      default:
        currentView = (
          <HomeView
            libraries={libraries}
            librariesLoading={librariesQuery.isLoading}
            onOpenMedia={(item) => openMediaDetail(item, "home")}
            onOpenSettings={() => setRoute({ kind: "view", view: "settings" })}
            servers={servers}
            serversLoading={serversQuery.isLoading}
          />
        );
        break;
    }
  }

  return (
    <Tooltip.Provider delayDuration={250}>
      <div className="lumi-shell">
        <aside className="shell-sidebar" aria-label="Primary">
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true">
              L
            </span>
            <strong>Lumi</strong>
          </div>
          <nav className="primary-nav" aria-label="Main navigation">
            {navItems.map((item) => (
              <NavButton
                active={activeView === item.id}
                icon={item.icon}
                key={item.id}
                label={item.label}
                onMoveRight={focusFirstContentEntry}
                onSelect={() => setRoute({ kind: "view", view: item.id })}
              />
            ))}
          </nav>
        </aside>
        <main className="shell-content" onKeyDown={handleContentKeyDown}>
          {currentView}
        </main>
      </div>
    </Tooltip.Provider>
  );
}

type NavButtonProps = {
  active: boolean;
  icon: Icon;
  label: string;
  onMoveRight: () => boolean;
  onSelect: () => void;
};

function NavButton({
  active,
  icon: IconComponent,
  label,
  onMoveRight,
  onSelect,
}: NavButtonProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowRight" && onMoveRight()) {
      event.preventDefault();
    }
  }

  return (
    <FocusableCard
      aria-current={active ? "page" : undefined}
      className="nav-button"
      data-shell-nav-active={active ? "true" : undefined}
      focusScope="main-navigation"
      onKeyDown={handleKeyDown}
      onClick={onSelect}
    >
      <IconComponent aria-hidden="true" size={20} />
      <span>{label}</span>
    </FocusableCard>
  );
}

function SearchView() {
  return (
    <section className="view-stack" aria-labelledby="search-title">
      <header className="view-header">
        <div>
          <p className="eyebrow">Global</p>
          <h1 id="search-title">Search</h1>
        </div>
      </header>
      <div className="search-panel">
        <Search aria-hidden="true" size={22} />
        <input aria-label="Search media" placeholder="Search media" type="search" />
      </div>
    </section>
  );
}
