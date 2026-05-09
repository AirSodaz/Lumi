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
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { AnimatePresence } from "motion/react";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useNavigationType,
  useParams,
  useSearchParams,
} from "react-router";
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
import {
  appendParent,
  defaultSettingsPanel,
  favoritesPath,
  getDetailBackPath,
  getDetailReturnLabelKey,
  homePath,
  libraryPath,
  mediaDetailPath,
  parseMediaDetailSource,
  parseSettingsPanel,
  searchPath,
  settingsPath,
  type SettingsPanel,
} from "./shellRoutes";

type ViewId = "home" | "favorites" | "search" | "settings";
type Icon = LucideIcon;
type ShellPlatform = "macos" | "windows";

type RouteHistoryState = {
  canGoBack: boolean;
  canGoForward: boolean;
  index: number;
  stack: string[];
};

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
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationTypeName();
  const [routeHistory, setRouteHistory] = useState<RouteHistoryState>(() => ({
    canGoBack: false,
    canGoForward: false,
    index: 0,
    stack: [],
  }));
  const lastLocationKey = useRef<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    readSidebarCollapsedPreference,
  );
  const platform = useMemo(() => detectShellPlatform(), []);
  const serversQuery = useServers();
  const servers = serversQuery.data ?? [];
  const [preferredServerId, setPreferredServerId] = useState(
    readSelectedServerPreference,
  );
  const selectedServer = selectServer(servers, preferredServerId);
  const selectedServerId = selectedServer?.id ?? null;
  const librariesQuery = useLibraries(selectedServerId);
  const libraries = librariesQuery.data ?? [];
  const activeView = getActiveView(location.pathname, location.search);
  const routeKey = getRouteKey(location.pathname);

  useEffect(() => {
    if (
      preferredServerId !== selectedServerId &&
      !serversQuery.isLoading &&
      (preferredServerId !== null || selectedServerId !== null)
    ) {
      writeSelectedServerPreference(selectedServerId);
    }
  }, [preferredServerId, selectedServerId, serversQuery.isLoading]);

  useLayoutEffect(() => {
    if (lastLocationKey.current === location.key) {
      return;
    }

    lastLocationKey.current = location.key;
    setRouteHistory((current) =>
      nextRouteHistoryState(
        current,
        navigationType,
        getRouteSignature(location.pathname, location.search),
      ),
    );
  }, [location.key, location.pathname, location.search, navigationType]);

  function goBack() {
    navigate(-1);
  }

  function goForward() {
    navigate(1);
  }

  function selectActiveServer(serverId: string) {
    setPreferredServerId(serverId);
    writeSelectedServerPreference(serverId);
  }

  function openSettingsForAddServer() {
    navigate(settingsPath("mediaServices", { addServer: true }));
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

  return (
    <Tooltip.Provider delayDuration={250}>
      <div
        className="lumi-shell"
        data-platform={platform}
        data-sidebar-collapsed={sidebarCollapsed ? "true" : "false"}
      >
        <AppChrome
          canGoBack={routeHistory.canGoBack}
          canGoForward={routeHistory.canGoForward}
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
                    onSelect={() => navigate(pathForView(item.id))}
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
                    onSelect={() => navigate(pathForView(item.id))}
                  />
                ))}
              </div>
            </div>
          </nav>
        </aside>
        <main className="shell-content" onKeyDown={handleContentKeyDown} tabIndex={-1}>
          <AnimatePresence mode="wait" initial={false}>
            <MotionPage key={routeKey} routeKey={routeKey}>
              <Routes location={location}>
                <Route index element={<Navigate replace to={homePath()} />} />
                <Route
                  path="/home"
                  element={
                    <HomeRoute
                      libraries={libraries}
                      librariesLoading={librariesQuery.isLoading}
                      onOpenSettings={openSettingsForAddServer}
                      selectedServer={selectedServer}
                      servers={servers}
                      serversLoading={serversQuery.isLoading}
                    />
                  }
                />
                <Route
                  path="/favorites"
                  element={
                    <FavoritesRoute
                      selectedServer={selectedServer}
                      serversLoading={serversQuery.isLoading}
                    />
                  }
                />
                <Route path="/search" element={<SearchView />} />
                <Route
                  path="/settings/:panel"
                  element={
                    <SettingsRoute
                      onSelectServer={selectActiveServer}
                      selectedServerId={selectedServerId}
                    />
                  }
                />
                <Route
                  path="/servers/:serverId/libraries/:libraryId"
                  element={
                    <LibraryRoute
                      fallbackLibraries={libraries}
                      fallbackLibrariesLoading={librariesQuery.isLoading}
                      fallbackSelectedServer={selectedServer}
                      servers={servers}
                    />
                  }
                />
                <Route path="/servers/:serverId/items/:itemId" element={<MediaDetailRoute />} />
                <Route path="*" element={<Navigate replace to={homePath()} />} />
              </Routes>
            </MotionPage>
          </AnimatePresence>
        </main>
      </div>
    </Tooltip.Provider>
  );
}

type HomeRouteProps = {
  libraries: LibraryItem[];
  librariesLoading: boolean;
  onOpenSettings: () => void;
  selectedServer: ServerProfile | null;
  servers: ServerProfile[];
  serversLoading: boolean;
};

function HomeRoute({
  libraries,
  librariesLoading,
  onOpenSettings,
  selectedServer,
  servers,
  serversLoading,
}: HomeRouteProps) {
  const navigate = useNavigate();

  function openMediaDetail(item: LibraryItem) {
    navigate(mediaDetailPath({ from: "home", itemId: item.id, serverId: item.serverId }));
  }

  return (
    <HomeView
      libraries={libraries}
      librariesLoading={librariesLoading}
      onOpenLibrary={(item) => navigate(libraryPath(item.serverId, item.id))}
      onOpenMedia={openMediaDetail}
      onOpenSettings={onOpenSettings}
      selectedServer={selectedServer}
      servers={servers}
      serversLoading={serversLoading}
    />
  );
}

function FavoritesRoute({
  selectedServer,
  serversLoading,
}: {
  selectedServer: ServerProfile | null;
  serversLoading: boolean;
}) {
  const navigate = useNavigate();

  return (
    <FavoritesView
      onOpenMedia={(item) =>
        navigate(mediaDetailPath({ from: "favorites", itemId: item.id, serverId: item.serverId }))
      }
      selectedServer={selectedServer}
      serversLoading={serversLoading}
    />
  );
}

function SettingsRoute({
  onSelectServer,
  selectedServerId,
}: {
  onSelectServer: (serverId: string) => void;
  selectedServerId: string | null;
}) {
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const panel = parseSettingsPanel(params.panel);
  const routeRequestsAddServer = searchParams.get("addServer") === "1";
  const [localAddServerDialogOpen, setLocalAddServerDialogOpen] = useState(false);
  const addServerDialogOpen = routeRequestsAddServer || localAddServerDialogOpen;

  function setPanel(nextPanel: SettingsPanel) {
    navigate(settingsPath(nextPanel));
  }

  function setAddServerDialogOpen(open: boolean) {
    if (!routeRequestsAddServer) {
      setLocalAddServerDialogOpen(open);
      return;
    }

    const nextParams = new URLSearchParams(searchParams);

    if (open) {
      nextParams.set("addServer", "1");
    } else {
      nextParams.delete("addServer");
    }

    setSearchParams(nextParams, { replace: true });
  }

  return (
    <SettingsView
      onAddServerDialogOpenChange={setAddServerDialogOpen}
      onPanelChange={setPanel}
      onSelectServer={onSelectServer}
      openAddServerDialog={addServerDialogOpen}
      panel={panel}
      selectedServerId={selectedServerId}
    />
  );
}

type LibraryRouteProps = {
  fallbackLibraries: LibraryItem[];
  fallbackLibrariesLoading: boolean;
  fallbackSelectedServer: ServerProfile | null;
  servers: ServerProfile[];
};

function LibraryRoute({
  fallbackLibraries,
  fallbackLibrariesLoading,
  fallbackSelectedServer,
  servers,
}: LibraryRouteProps) {
  const navigate = useNavigate();
  const params = useParams();
  const routeServerId = params.serverId ?? null;
  const routeLibraryId = params.libraryId ?? null;
  const routeLibrariesQuery = useLibraries(routeServerId);
  const routeServer = selectServerById(servers, routeServerId) ?? fallbackSelectedServer;
  const libraries = routeServerId === fallbackSelectedServer?.id
    ? fallbackLibraries
    : routeLibrariesQuery.data ?? [];
  const loading = routeServerId === fallbackSelectedServer?.id
    ? fallbackLibrariesLoading
    : routeLibrariesQuery.isLoading;

  if (!routeServerId || !routeLibraryId) {
    return <Navigate replace to={homePath()} />;
  }

  return (
    <LibrariesView
      childrenServerId={routeServerId}
      libraries={libraries}
      loading={loading}
      onBackToHome={() => navigate(homePath())}
      onOpenMedia={(item) =>
        navigate(
          mediaDetailPath({
            from: "library",
            itemId: item.id,
            libraryId: routeLibraryId,
            serverId: item.serverId,
          }),
        )
      }
      selectedLibraryId={routeLibraryId}
      selectedServer={routeServer}
      servers={servers}
    />
  );
}

function MediaDetailRoute() {
  const { translate } = useI18n();
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const serverId = params.serverId ?? "";
  const itemId = params.itemId ?? "";
  const source = parseMediaDetailSource(searchParams);

  if (!serverId || !itemId) {
    return <Navigate replace to={homePath()} />;
  }

  return (
    <MediaDetailView
      itemId={itemId}
      onBack={() => navigate(getDetailBackPath(serverId, source))}
      onOpenMedia={(item) =>
        navigate(
          mediaDetailPath({
            from: source.from,
            itemId: item.id,
            libraryId: source.from === "library" ? source.libraryId : null,
            parentTrail: appendParent(source, itemId),
            serverId: item.serverId,
          }),
        )
      }
      returnLabel={translate(getDetailReturnLabelKey(source))}
      serverId={serverId}
    />
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

function selectServerById(
  servers: readonly ServerProfile[],
  serverId: string | null,
) {
  return servers.find((server) => server.id === serverId) ?? null;
}

function pathForView(view: ViewId) {
  switch (view) {
    case "favorites":
      return favoritesPath();
    case "search":
      return searchPath();
    case "settings":
      return settingsPath(defaultSettingsPanel);
    case "home":
    default:
      return homePath();
  }
}

function getActiveView(pathname: string, search: string): ViewId {
  if (pathname.startsWith("/favorites")) {
    return "favorites";
  }

  if (pathname.startsWith("/search")) {
    return "search";
  }

  if (pathname.startsWith("/settings")) {
    return "settings";
  }

  if (pathname.includes("/items/")) {
    return parseMediaDetailSource(new URLSearchParams(search)).from === "favorites"
      ? "favorites"
      : "home";
  }

  return "home";
}

function getRouteKey(pathname: string) {
  return pathname;
}

function nextRouteHistoryState(
  current: RouteHistoryState,
  navigationType: "POP" | "PUSH" | "REPLACE",
  signature: string,
): RouteHistoryState {
  if (current.stack.length === 0) {
    return {
      canGoBack: false,
      canGoForward: false,
      index: 0,
      stack: [signature],
    };
  }

  if (navigationType === "REPLACE") {
    const stack = [...current.stack];
    stack[current.index] = signature;

    return {
      canGoBack: current.index > 0,
      canGoForward: current.index < stack.length - 1,
      index: current.index,
      stack,
    };
  }

  if (navigationType === "PUSH") {
    const nextIndex = current.index + 1;
    const stack = [...current.stack.slice(0, nextIndex), signature];

    return {
      canGoBack: nextIndex > 0,
      canGoForward: false,
      index: nextIndex,
      stack,
    };
  }

  const previousIndex = current.stack.lastIndexOf(signature, current.index - 1);
  const forwardIndex = current.stack.indexOf(signature, current.index + 1);
  const nextIndex =
    previousIndex >= 0
      ? previousIndex
      : forwardIndex >= 0
        ? forwardIndex
        : current.index;

  return {
    canGoBack: nextIndex > 0,
    canGoForward: nextIndex < current.stack.length - 1,
    index: nextIndex,
    stack: current.stack,
  };
}

function useNavigationTypeName() {
  return useNavigationType() as "POP" | "PUSH" | "REPLACE";
}

function getRouteSignature(pathname: string, search: string) {
  return `${pathname}${search}`;
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
