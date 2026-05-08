import {
  ChevronLeft,
  ChevronRight,
  Home,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
  Search,
  Settings,
  Square,
  Star,
  X,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Tooltip from "@radix-ui/react-tooltip";
import { FocusableCard } from "../../components/focus";
import { GlassPanel, MotionPage } from "../../components/layout";
import { MotionButton } from "../../components/motion";
import { dropdownMotion } from "../../lib/motion/presets";
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
  type ServerProfile,
} from "../../lib/tauriClient";
import { FavoritesView } from "../favorites/FavoritesView";
import { HomeView } from "../home/HomeView";
import { LibrariesView } from "../libraries/LibrariesView";
import { MediaDetailView } from "../media-detail/MediaDetailView";
import { SettingsView } from "../settings/SettingsView";

type ViewId = "home" | "favorites" | "search" | "settings";
type ReturnView = "favorites" | "home";
type Icon = LucideIcon;
type ShellPlatform = "macos" | "windows";

type ShellRoute =
  | { kind: "view"; view: ViewId }
  | { kind: "library"; libraryId: string }
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
const sidebarCollapsedStorageKey = "lumi.sidebarCollapsed";
const selectedServerStorageKey = "lumi.selectedServerId";

const navItems: Array<{ id: ViewId; label: string; icon: Icon }> = [
  { id: "home", label: "Home", icon: Home },
  { id: "favorites", label: "收藏", icon: Star },
  { id: "search", label: "Search", icon: Search },
  { id: "settings", label: "Settings", icon: Settings },
];

export function LumiShell() {
  const [history, setHistory] = useState<RouteHistory>(() => ({
    backStack: [],
    current: initialRoute,
    forwardStack: [],
  }));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    readSidebarCollapsedPreference,
  );
  const platform = useMemo(() => detectShellPlatform(), []);
  const route = history.current;
  const serversQuery = useServers();
  const servers = serversQuery.data ?? [];
  const [preferredServerId, setPreferredServerId] = useState(
    readSelectedServerPreference,
  );
  const selectedServer = selectServer(servers, preferredServerId);
  const selectedServerId = selectedServer?.id ?? null;
  const librariesQuery = useLibraries(selectedServerId);
  const libraries = librariesQuery.data ?? [];
  const activeView =
    route.kind === "mediaDetail"
      ? route.returnView
      : route.kind === "library"
        ? "home"
        : route.view;
  const routeKey = routeIdentity(route);

  useEffect(() => {
    if (
      preferredServerId !== selectedServerId &&
      !serversQuery.isLoading &&
      (preferredServerId !== null || selectedServerId !== null)
    ) {
      writeSelectedServerPreference(selectedServerId);
    }
  }, [preferredServerId, selectedServerId, serversQuery.isLoading]);

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

  function openLibrary(item: LibraryItem) {
    setRouteWithTransition({
      kind: "library",
      libraryId: item.id,
    });
  }

  function selectActiveServer(serverId: string) {
    setPreferredServerId(serverId);
    writeSelectedServerPreference(serverId);
    setRouteWithTransition({ kind: "view", view: "home" });
  }

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((current) => {
      const next = !current;
      writeSidebarCollapsedPreference(next);
      return next;
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
        returnLabel={route.returnView === "favorites" ? "收藏" : "Home"}
        serverId={route.serverId}
      />
    );
  } else if (route.kind === "library") {
    currentView = (
      <LibrariesView
        libraries={libraries}
        loading={librariesQuery.isLoading}
        onBackToHome={() =>
          setRouteWithTransition({ kind: "view", view: "home" })
        }
        onOpenMedia={(item) => openMediaDetail(item, "home")}
        selectedLibraryId={route.libraryId}
        selectedServer={selectedServer}
        servers={servers}
      />
    );
  } else {
    switch (route.view) {
      case "favorites":
        currentView = (
          <FavoritesView
            onOpenMedia={(item) => openMediaDetail(item, "favorites")}
            selectedServer={selectedServer}
            serversLoading={serversQuery.isLoading}
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
            onOpenLibrary={openLibrary}
            onOpenMedia={(item) => openMediaDetail(item, "home")}
            onOpenSettings={() =>
              setRouteWithTransition({ kind: "view", view: "settings" })
            }
            onSelectServer={selectActiveServer}
            selectedServer={selectedServer}
            servers={servers}
            serversLoading={serversQuery.isLoading}
          />
        );
        break;
    }
  }

  return (
    <Tooltip.Provider delayDuration={250}>
      <div
        className="lumi-shell"
        data-platform={platform}
        data-sidebar-collapsed={sidebarCollapsed ? "true" : "false"}
      >
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
        <aside className="shell-sidebar" aria-label="Primary" id="lumi-primary-sidebar">
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true">
              L
            </span>
            <strong className="brand-name">Lumi</strong>
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <MotionButton
                  aria-controls="lumi-primary-sidebar"
                  aria-expanded={!sidebarCollapsed}
                  aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                  className="sidebar-toggle"
                  onClick={toggleSidebarCollapsed}
                  type="button"
                >
                  {sidebarCollapsed ? (
                    <PanelLeftOpen aria-hidden="true" size={17} />
                  ) : (
                    <PanelLeftClose aria-hidden="true" size={17} />
                  )}
                </MotionButton>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content className="tooltip-content" side="right">
                  {sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                  <Tooltip.Arrow className="tooltip-arrow" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </div>
          <nav className="primary-nav" aria-label="Main navigation">
            {navItems.map((item) => (
              <NavButton
                active={activeView === item.id}
                collapsed={sidebarCollapsed}
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
          <AnimatePresence mode="wait" initial={false}>
            <MotionPage key={routeKey} routeKey={routeKey}>
              {currentView}
            </MotionPage>
          </AnimatePresence>
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
        <MotionButton
          aria-label="Go back"
          className="titlebar-icon-button"
          disabled={!canGoBack}
          onClick={onBack}
          type="button"
        >
          <ChevronLeft aria-hidden="true" size={16} />
        </MotionButton>
        <MotionButton
          aria-label="Go forward"
          className="titlebar-icon-button"
          disabled={!canGoForward}
          onClick={onForward}
          type="button"
        >
          <ChevronRight aria-hidden="true" size={16} />
        </MotionButton>
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
        <MotionButton
          aria-label="Minimize window"
          className="titlebar-window-button"
          onClick={() => void runWindowCommand("minimize")}
          type="button"
        >
          <Minus aria-hidden="true" size={14} />
        </MotionButton>
        <MotionButton
          aria-label="Maximize or restore window"
          className="titlebar-window-button"
          onClick={() => void runWindowCommand("toggleMaximize")}
          type="button"
        >
          <Square aria-hidden="true" size={12} />
        </MotionButton>
        <MotionButton
          aria-label="Close window"
          className="titlebar-window-button close"
          onClick={() => void runWindowCommand("close")}
          type="button"
        >
          <X aria-hidden="true" size={16} />
        </MotionButton>
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
      <DropdownMenu.Trigger asChild>
        <MotionButton className="titlebar-menu-trigger" type="button">
          {label}
        </MotionButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" asChild>
          <motion.div
            className="dropdown-content titlebar-menu-content"
            data-motion-surface="dropdown"
            {...dropdownMotion}
          >
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
          </motion.div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

type NavButtonProps = {
  active: boolean;
  collapsed: boolean;
  icon: Icon;
  label: string;
  onMoveRight: () => boolean;
  onSelect: () => void;
};

function NavButton({
  active,
  collapsed,
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

  const button = (
    <FocusableCard
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? label : undefined}
      className="nav-button"
      data-shell-nav-active={active ? "true" : undefined}
      focusScope="main-navigation"
      motionKind="control"
      onKeyDown={handleKeyDown}
      onClick={onSelect}
    >
      <IconComponent aria-hidden="true" size={18} />
      <span aria-hidden={collapsed ? true : undefined} className="nav-button-label">
        {label}
      </span>
    </FocusableCard>
  );

  if (!collapsed) {
    return button;
  }

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{button}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip-content" side="right">
          {label}
          <Tooltip.Arrow className="tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function SearchView() {
  return (
    <section className="view-stack search-view app-workbench" aria-labelledby="search-title">
      <header className="workbench-header">
        <div className="workbench-title-block">
          <span className="workbench-kicker">Library</span>
          <h1 id="search-title">Search</h1>
          <div className="workbench-meta-row">
            <span>Titles, seasons, episodes</span>
            <span>Local query</span>
          </div>
        </div>
      </header>
      <div className="browser-toolbar" aria-label="Search scope">
        <span className="server-dot" aria-hidden="true" />
        <strong>All connected media</strong>
        <span className="status-chip">Ready</span>
      </div>
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

function readSidebarCollapsedPreference() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(sidebarCollapsedStorageKey) === "true";
  } catch {
    return false;
  }
}

function writeSidebarCollapsedPreference(collapsed: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(sidebarCollapsedStorageKey, String(collapsed));
  } catch {
    // Sidebar state is a convenience preference; ignore unavailable storage.
  }
}

function readSelectedServerPreference() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(selectedServerStorageKey);
  } catch {
    return null;
  }
}

function writeSelectedServerPreference(serverId: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (serverId) {
      window.localStorage.setItem(selectedServerStorageKey, serverId);
      return;
    }

    window.localStorage.removeItem(selectedServerStorageKey);
  } catch {
    // Server selection is a convenience preference; ignore unavailable storage.
  }
}

function selectServer(
  servers: readonly ServerProfile[],
  preferredServerId: string | null,
) {
  if (servers.length === 0) {
    return null;
  }

  return (
    servers.find((server) => server.id === preferredServerId) ??
    servers[0] ??
    null
  );
}

function routeIdentity(route: ShellRoute) {
  if (route.kind === "mediaDetail") {
    return `media-${route.serverId}-${route.itemId}`;
  }

  if (route.kind === "library") {
    return `library-${route.libraryId}`;
  }

  return route.view;
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
