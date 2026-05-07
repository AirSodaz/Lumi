import {
  ChevronLeft,
  ChevronRight,
  Home,
  Library,
  Minus,
  type LucideIcon,
  Search,
  Settings,
  Square,
  X,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useMemo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Tooltip from "@radix-ui/react-tooltip";
import { FocusableCard } from "../../components/focus";
import { GlassPanel, MotionPage } from "../../components/layout";
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
type ShellPlatform = "macos" | "windows";

type ShellRoute =
  | { kind: "view"; view: ViewId }
  | { itemId: string; kind: "mediaDetail"; returnView: ReturnView; serverId: string };

type RouteHistory = {
  backStack: ShellRoute[];
  current: ShellRoute;
  forwardStack: ShellRoute[];
};

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => unknown;
};

const initialRoute: ShellRoute = { kind: "view", view: "home" };

const navItems: Array<{ id: ViewId; label: string; icon: Icon }> = [
  { id: "home", label: "Home", icon: Home },
  { id: "libraries", label: "Libraries", icon: Library },
  { id: "search", label: "Search", icon: Search },
  { id: "settings", label: "Settings", icon: Settings },
];

export function LumiShell() {
  const [history, setHistory] = useState<RouteHistory>(() => ({
    backStack: [],
    current: initialRoute,
    forwardStack: [],
  }));
  const platform = useMemo(() => detectShellPlatform(), []);
  const route = history.current;
  const serversQuery = useServers();
  const servers = serversQuery.data ?? [];
  const selectedServerId = servers[0]?.id ?? null;
  const librariesQuery = useLibraries(selectedServerId);
  const libraries = librariesQuery.data ?? [];
  const activeView = route.kind === "mediaDetail" ? route.returnView : route.view;
  const routeKey = routeIdentity(route);

  function runRouteTransition(updateRoute: () => void) {
    const reduceMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const transitionDocument =
      typeof document !== "undefined"
        ? (document as ViewTransitionDocument)
        : null;

    if (transitionDocument?.startViewTransition && !reduceMotion) {
      transitionDocument.startViewTransition(updateRoute);
      return;
    }

    updateRoute();
  }

  function setRouteWithTransition(nextRoute: ShellRoute) {
    runRouteTransition(() =>
      setHistory((currentHistory) => pushRoute(currentHistory, nextRoute)),
    );
  }

  function goBack() {
    if (history.backStack.length === 0) {
      return;
    }

    runRouteTransition(() => setHistory(popBack));
  }

  function goForward() {
    if (history.forwardStack.length === 0) {
      return;
    }

    runRouteTransition(() => setHistory(popForward));
  }

  function openMediaDetail(item: LibraryItem, returnView: ReturnView) {
    setRouteWithTransition({
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
        onBack={() =>
          setRouteWithTransition({ kind: "view", view: route.returnView })
        }
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
            onOpenSettings={() =>
              setRouteWithTransition({ kind: "view", view: "settings" })
            }
            servers={servers}
            serversLoading={serversQuery.isLoading}
          />
        );
        break;
    }
  }

  return (
    <Tooltip.Provider delayDuration={250}>
      <div className="lumi-shell" data-platform={platform}>
        <AppChrome
          activeView={activeView}
          canGoBack={history.backStack.length > 0}
          canGoForward={history.forwardStack.length > 0}
          onBack={goBack}
          onForward={goForward}
          onNavigate={(view) => setRouteWithTransition({ kind: "view", view })}
          platform={platform}
        />
        <div className="shell-vignette" aria-hidden="true" />
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
                onSelect={() =>
                  setRouteWithTransition({ kind: "view", view: item.id })
                }
              />
            ))}
          </nav>
        </aside>
        <main className="shell-content" onKeyDown={handleContentKeyDown}>
          <MotionPage key={routeKey} routeKey={routeKey}>
            {currentView}
          </MotionPage>
        </main>
      </div>
    </Tooltip.Provider>
  );
}

type AppChromeProps = {
  activeView: ViewId;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onNavigate: (view: ViewId) => void;
  platform: ShellPlatform;
};

function AppChrome({
  activeView,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onNavigate,
  platform,
}: AppChromeProps) {
  if (platform === "macos") {
    return null;
  }

  function handleDragMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (event.button !== 0 || event.detail > 1) {
      return;
    }

    void runWindowCommand("drag");
  }

  function handleDragDoubleClick() {
    void runWindowCommand("toggleMaximize");
  }

  return (
    <header className="windows-titlebar" aria-label="Windows title bar">
      <nav className="titlebar-navigation" aria-label="Window navigation">
        <button
          aria-label="Go back"
          className="titlebar-icon-button"
          disabled={!canGoBack}
          onClick={onBack}
          type="button"
        >
          <ChevronLeft aria-hidden="true" size={16} />
        </button>
        <button
          aria-label="Go forward"
          className="titlebar-icon-button"
          disabled={!canGoForward}
          onClick={onForward}
          type="button"
        >
          <ChevronRight aria-hidden="true" size={16} />
        </button>
      </nav>
      <div className="titlebar-menu-bar" role="menubar" aria-label="Application menu">
        <TitlebarMenu
          items={[
            { disabled: true, label: "Open File" },
            { disabled: true, label: "Open Folder" },
            { label: "Settings", onSelect: () => onNavigate("settings"), shortcut: "Ctrl+," },
          ]}
          label="File"
        />
        <TitlebarMenu
          items={[
            { disabled: true, label: "Undo", shortcut: "Ctrl+Z" },
            { disabled: true, label: "Redo", shortcut: "Ctrl+Y" },
            { disabled: true, label: "Cut", separatorBefore: true, shortcut: "Ctrl+X" },
            { disabled: true, label: "Copy", shortcut: "Ctrl+C" },
          ]}
          label="Edit"
        />
        <TitlebarMenu
          items={navItems.map((item) => ({
            label: item.label,
            onSelect: () => onNavigate(item.id),
            selected: activeView === item.id,
          }))}
          label="View"
        />
        <TitlebarMenu
          items={[
            { label: "Minimize Window", onSelect: () => void runWindowCommand("minimize") },
            {
              label: "Maximize or Restore Window",
              onSelect: () => void runWindowCommand("toggleMaximize"),
            },
            { label: "Close Window", onSelect: () => void runWindowCommand("close") },
          ]}
          label="Window"
        />
        <TitlebarMenu
          items={[
            { disabled: true, label: "Lumi Help" },
            { disabled: true, label: "About Lumi" },
          ]}
          label="Help"
        />
      </div>
      <div
        className="windows-titlebar-drag-region"
        onDoubleClick={handleDragDoubleClick}
        onMouseDown={handleDragMouseDown}
      />
      <div className="titlebar-window-controls" aria-label="Window controls">
        <button
          aria-label="Minimize window"
          className="titlebar-window-button"
          onClick={() => void runWindowCommand("minimize")}
          type="button"
        >
          <Minus aria-hidden="true" size={14} />
        </button>
        <button
          aria-label="Maximize or restore window"
          className="titlebar-window-button"
          onClick={() => void runWindowCommand("toggleMaximize")}
          type="button"
        >
          <Square aria-hidden="true" size={12} />
        </button>
        <button
          aria-label="Close window"
          className="titlebar-window-button close"
          onClick={() => void runWindowCommand("close")}
          type="button"
        >
          <X aria-hidden="true" size={16} />
        </button>
      </div>
    </header>
  );
}

type TitlebarMenuItem = {
  disabled?: boolean;
  label: string;
  onSelect?: () => void;
  selected?: boolean;
  separatorBefore?: boolean;
  shortcut?: string;
};

type TitlebarMenuProps = {
  items: TitlebarMenuItem[];
  label: string;
};

function TitlebarMenu({ items, label }: TitlebarMenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="titlebar-menu-trigger" type="button">
        {label}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="dropdown-content titlebar-menu-content" align="start">
          {items.map((item) => (
            <DropdownMenu.Group key={item.label}>
              {item.separatorBefore ? <DropdownMenu.Separator className="titlebar-menu-separator" /> : null}
              <DropdownMenu.Item
                aria-current={item.selected ? "page" : undefined}
                className="dropdown-item titlebar-menu-item"
                disabled={item.disabled}
                onSelect={item.onSelect}
              >
                <span>{item.label}</span>
                {item.shortcut ? <span className="titlebar-menu-shortcut">{item.shortcut}</span> : null}
              </DropdownMenu.Item>
            </DropdownMenu.Group>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
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
      <IconComponent aria-hidden="true" size={18} />
      <span>{label}</span>
    </FocusableCard>
  );
}

function SearchView() {
  return (
    <section className="view-stack search-view" aria-labelledby="search-title">
      <header className="view-header cinematic-header">
        <div>
          <p className="eyebrow">Find Media</p>
          <h1 id="search-title">Search</h1>
        </div>
      </header>
      <GlassPanel className="search-panel" aria-label="Search media panel">
        <Search aria-hidden="true" size={20} />
        <input aria-label="Search media" placeholder="Search media" type="search" />
      </GlassPanel>
      <GlassPanel className="empty-state search-empty">
        <strong>Search your connected server</strong>
        <span>Type a title, collection, season, or episode name.</span>
      </GlassPanel>
    </section>
  );
}

function detectShellPlatform(): ShellPlatform {
  if (typeof navigator === "undefined") {
    return "windows";
  }

  const platformText = [
    navigator.userAgent,
    "userAgentData" in navigator
      ? (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform
      : "",
    navigator.platform,
  ]
    .filter(Boolean)
    .join(" ");

  return /macintosh|mac os|macintel|macppc|mac68k/i.test(platformText)
    ? "macos"
    : "windows";
}

function routeIdentity(route: ShellRoute) {
  return route.kind === "mediaDetail"
    ? `media-${route.serverId}-${route.itemId}`
    : route.view;
}

function pushRoute(history: RouteHistory, nextRoute: ShellRoute): RouteHistory {
  if (routeIdentity(history.current) === routeIdentity(nextRoute)) {
    return history;
  }

  return {
    backStack: [...history.backStack, history.current],
    current: nextRoute,
    forwardStack: [],
  };
}

function popBack(history: RouteHistory): RouteHistory {
  const previous = history.backStack[history.backStack.length - 1];

  if (!previous) {
    return history;
  }

  return {
    backStack: history.backStack.slice(0, -1),
    current: previous,
    forwardStack: [history.current, ...history.forwardStack],
  };
}

function popForward(history: RouteHistory): RouteHistory {
  const next = history.forwardStack[0];

  if (!next) {
    return history;
  }

  return {
    backStack: [...history.backStack, history.current],
    current: next,
    forwardStack: history.forwardStack.slice(1),
  };
}

type WindowCommand = "close" | "drag" | "minimize" | "toggleMaximize";

async function runWindowCommand(command: WindowCommand) {
  const currentWindow = getCurrentWindow();

  try {
    switch (command) {
      case "close":
        await currentWindow.close();
        break;
      case "drag":
        await currentWindow.startDragging();
        break;
      case "minimize":
        await currentWindow.minimize();
        break;
      case "toggleMaximize":
        await currentWindow.toggleMaximize();
        break;
    }
  } catch {
    // Browser preview cannot execute native window commands.
  }
}
