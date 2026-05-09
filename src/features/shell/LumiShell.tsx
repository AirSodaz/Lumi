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
  type PointerEvent,
  type ReactNode,
} from "react";
import { AnimatePresence } from "motion/react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { FocusableCard } from "../../components/focus";
import { GlassPanel, MotionPage } from "../../components/layout";
import { MotionButton } from "../../components/motion";
import { useI18n } from "../../lib/i18n";
import {
  directionFromKey,
  focusAdjacentScope,
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

const initialRoute: ShellRoute = { kind: "view", view: "home" };
const sidebarCollapsedStorageKey = "lumi.sidebarCollapsed";
const selectedServerStorageKey = "lumi.selectedServerId";

const navItems: Array<{ id: ViewId; labelKey: string; icon: Icon }> = [
  { id: "home", labelKey: "nav.home", icon: Home },
  { id: "favorites", labelKey: "nav.favorites", icon: Star },
  { id: "search", labelKey: "nav.search", icon: Search },
  { id: "settings", labelKey: "nav.settings", icon: Settings },
];

const primaryNavItems = navItems.filter((item) => item.id !== "settings");
const utilityNavItems = navItems.filter((item) => item.id === "settings");

export function LumiShell() {
  const { translate } = useI18n();
  const [history, setHistory] = useState<RouteHistory>(() => ({
    backStack: [],
    current: initialRoute,
    forwardStack: [],
  }));
  const [openAddServerDialog, setOpenAddServerDialog] = useState(false);
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
  }

  function openSettingsForAddServer() {
    setOpenAddServerDialog(true);
    setRouteWithTransition({ kind: "view", view: "settings" });
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
    if (!direction) {
      return;
    }

    const target = event.target instanceof HTMLElement ? event.target : null;
    const focusable = target?.closest<HTMLButtonElement>("[data-focus-scope]");
    const scope = focusable?.dataset.focusScope;

    if (!focusable) {
      if (focusFirstContentEntry()) {
        event.preventDefault();
      }
      return;
    }

    if (
      direction === "left" &&
      focusable &&
      scope &&
      isAtScopeBoundary(scope, focusable, direction) &&
      focusActiveNavigation()
    ) {
      event.preventDefault();
      return;
    }

    if (
      (direction === "down" || direction === "up") &&
      focusable &&
      scope &&
      isAtScopeBoundary(scope, focusable, direction) &&
      focusAdjacentScope(scope, focusable, direction)
    ) {
      event.preventDefault();
    }
  }

  function handleSidebarKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (
      event.defaultPrevented ||
      shouldIgnoreDirectionalKeyTarget(event.target)
    ) {
      return;
    }

    const direction = directionFromKey(event.key);
    if (!direction) {
      return;
    }

    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest("[data-focus-scope]")) {
      return;
    }

    if (focusActiveNavigation()) {
      event.preventDefault();
    }
  }

  function handleSidebarPointerDown(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0 || shouldIgnoreDirectionalKeyTarget(event.target)) {
      return;
    }

    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest("a, button, [data-focus-scope]")) {
      return;
    }

    event.currentTarget.focus({ preventScroll: true });
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
        returnLabel={
          route.returnView === "favorites"
            ? translate("nav.favorites")
            : translate("nav.home")
        }
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
        currentView = (
          <SettingsView
            openAddServerDialog={openAddServerDialog}
            onAddServerDialogOpenChange={setOpenAddServerDialog}
            onSelectServer={selectActiveServer}
            selectedServerId={selectedServerId}
          />
        );
        break;
      case "home":
      default:
        currentView = (
          <HomeView
            libraries={libraries}
            librariesLoading={librariesQuery.isLoading}
            onOpenLibrary={openLibrary}
            onOpenMedia={(item) => openMediaDetail(item, "home")}
            onOpenSettings={openSettingsForAddServer}
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
          canGoBack={history.backStack.length > 0}
          canGoForward={history.forwardStack.length > 0}
          onBack={goBack}
          onForward={goForward}
          platform={platform}
          selectedServer={selectedServer}
        />
        <div className="shell-vignette" aria-hidden="true" />
        <aside
          className="shell-sidebar"
          aria-label={translate("shell.aria.primary")}
          data-native-material={platform === "macos" ? "sidebar" : "mica"}
          id="lumi-primary-sidebar"
          onKeyDown={handleSidebarKeyDown}
          onPointerDown={handleSidebarPointerDown}
          tabIndex={-1}
        >
          <div className="brand-lockup">
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <MotionButton
                  aria-controls="lumi-primary-sidebar"
                  aria-expanded={!sidebarCollapsed}
                  aria-label={
                    sidebarCollapsed
                      ? translate("shell.sidebar.expand")
                      : translate("shell.sidebar.collapse")
                  }
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
                  {sidebarCollapsed
                    ? translate("shell.sidebar.expand")
                    : translate("shell.sidebar.collapse")}
                  <Tooltip.Arrow className="tooltip-arrow" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </div>
          <nav className="primary-nav" aria-label={translate("shell.aria.mainNavigation")}>
            <div className="sidebar-section">
              <span className="sidebar-section-label">
                {translate("shell.sidebar.section.library")}
              </span>
              <div className="sidebar-section-items">
                {primaryNavItems.map((item) => (
                  <NavButton
                    active={activeView === item.id}
                    collapsed={sidebarCollapsed}
                    icon={item.icon}
                    key={item.id}
                    label={translate(item.labelKey)}
                    onMoveRight={focusFirstContentEntry}
                    onSelect={() =>
                      setRouteWithTransition({ kind: "view", view: item.id })
                    }
                  />
                ))}
              </div>
            </div>
            <div className="sidebar-section">
              <span className="sidebar-section-label">
                {translate("shell.sidebar.section.system")}
              </span>
              <div className="sidebar-section-items">
                {utilityNavItems.map((item) => (
                  <NavButton
                    active={activeView === item.id}
                    collapsed={sidebarCollapsed}
                    icon={item.icon}
                    key={item.id}
                    label={translate(item.labelKey)}
                    onMoveRight={focusFirstContentEntry}
                    onSelect={() =>
                      setRouteWithTransition({ kind: "view", view: item.id })
                    }
                  />
                ))}
              </div>
            </div>
          </nav>
        </aside>
        <main className="shell-content" onKeyDown={handleContentKeyDown} tabIndex={-1}>
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
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  platform: ShellPlatform;
  selectedServer: ServerProfile | null | undefined;
};

function AppChrome({
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  platform,
  selectedServer,
}: AppChromeProps) {
  const { translate } = useI18n();
  const siteName = selectedServer?.name ?? translate("home.meta.noServer");

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
    <header className="windows-titlebar" aria-label={translate("shell.aria.windowsTitlebar")}>
      <nav className="titlebar-navigation" aria-label={translate("shell.aria.windowNavigation")}>
        <MotionButton
          aria-label={translate("shell.titlebar.goBack")}
          className="titlebar-icon-button"
          disabled={!canGoBack}
          onClick={onBack}
          type="button"
        >
          <ChevronLeft aria-hidden="true" size={16} />
        </MotionButton>
        <MotionButton
          aria-label={translate("shell.titlebar.goForward")}
          className="titlebar-icon-button"
          disabled={!canGoForward}
          onClick={onForward}
          type="button"
        >
          <ChevronRight aria-hidden="true" size={16} />
        </MotionButton>
      </nav>
      <div className="titlebar-identity" aria-label={translate("shell.aria.appIdentity")}>
        <strong>Lumi</strong>
        <span aria-label={translate("shell.aria.currentSite")} className="titlebar-site-tag">
          {siteName}
        </span>
      </div>
      <div
        className="windows-titlebar-drag-region"
        onDoubleClick={handleDragDoubleClick}
        onMouseDown={handleDragMouseDown}
      />
      <div className="titlebar-window-controls" aria-label={translate("shell.aria.windowControls")}>
        <MotionButton
          aria-label={translate("shell.titlebar.minimize")}
          className="titlebar-window-button minimize"
          onClick={() => void runWindowCommand("minimize")}
          type="button"
        >
          <Minus aria-hidden="true" size={14} />
        </MotionButton>
        <MotionButton
          aria-label={translate("shell.titlebar.maximizeRestore")}
          className="titlebar-window-button maximize-restore"
          onClick={() => void runWindowCommand("toggleMaximize")}
          type="button"
        >
          <Square aria-hidden="true" size={12} />
        </MotionButton>
        <MotionButton
          aria-label={translate("shell.titlebar.close")}
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
      motionKind="nav"
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
  const { translate } = useI18n();

  return (
    <section className="view-stack search-view app-workbench" aria-labelledby="search-title">
      <h1 className="sr-only" id="search-title">{translate("nav.search")}</h1>
      <div className="browser-toolbar" aria-label={translate("search.scope.aria")}>
        <span className="server-dot" aria-hidden="true" />
        <strong>{translate("search.meta.scope")}</strong>
        <span className="status-chip">{translate("common.ready")}</span>
      </div>
      <GlassPanel className="search-panel" aria-label={translate("search.panel.aria")}>
        <Search aria-hidden="true" size={20} />
        <input
          aria-label={translate("search.placeholder")}
          placeholder={translate("search.placeholder")}
          type="search"
        />
      </GlassPanel>
      <GlassPanel className="empty-state search-empty">
        <strong>{translate("search.empty.title")}</strong>
        <span>{translate("search.empty.description")}</span>
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
