import {
  Film,
  Home,
  Library,
  type LucideIcon,
  Search,
  Settings,
  TvMinimalPlay,
} from "lucide-react";
import { useState } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { FocusableCard } from "../../components/focus";
import {
  useLibraries,
  useServers,
  type LibraryItem,
  type ServerProfile,
} from "../../lib/tauriClient";
import { SettingsView } from "../settings/SettingsView";

type ViewId = "home" | "libraries" | "search" | "settings";
type Icon = LucideIcon;

const navItems: Array<{ id: ViewId; label: string; icon: Icon }> = [
  { id: "home", label: "Home", icon: Home },
  { id: "libraries", label: "Libraries", icon: Library },
  { id: "search", label: "Search", icon: Search },
  { id: "settings", label: "Settings", icon: Settings },
];

export function LumiShell() {
  const [activeView, setActiveView] = useState<ViewId>("home");
  const serversQuery = useServers();
  const servers = serversQuery.data ?? [];
  const selectedServerId = servers[0]?.id ?? null;
  const librariesQuery = useLibraries(selectedServerId);
  const libraries = librariesQuery.data ?? [];

  let currentView;

  switch (activeView) {
    case "libraries":
      currentView = (
        <LibrariesView
          libraries={libraries}
          loading={librariesQuery.isLoading}
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
          loading={serversQuery.isLoading}
          onOpenSettings={() => setActiveView("settings")}
          servers={servers}
        />
      );
      break;
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
                onSelect={() => setActiveView(item.id)}
              />
            ))}
          </nav>
        </aside>
        <main className="shell-content">{currentView}</main>
      </div>
    </Tooltip.Provider>
  );
}

type NavButtonProps = {
  active: boolean;
  icon: Icon;
  label: string;
  onSelect: () => void;
};

function NavButton({ active, icon: IconComponent, label, onSelect }: NavButtonProps) {
  return (
    <FocusableCard
      aria-current={active ? "page" : undefined}
      className="nav-button"
      focusScope="main-navigation"
      onClick={onSelect}
    >
      <IconComponent aria-hidden="true" size={20} />
      <span>{label}</span>
    </FocusableCard>
  );
}

type HomeViewProps = {
  loading: boolean;
  onOpenSettings: () => void;
  servers: ServerProfile[];
};

function HomeView({ loading, onOpenSettings, servers }: HomeViewProps) {
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
          <h2>{hasServers ? servers[0].name : "Connect your Emby library"}</h2>
          <p className="muted">
            {hasServers
              ? "Your saved server is ready for browsing."
              : "Add a server from Settings to begin browsing."}
          </p>
        </div>
        <TvMinimalPlay aria-hidden="true" size={54} />
      </section>

      <MediaRail
        items={[
          { label: "Continue Watching", value: loading ? "Loading" : "No items" },
          { label: "Latest", value: hasServers ? servers[0].name : "Empty" },
          { label: "Recommended", value: "V1" },
        ]}
        title="Today"
      />
    </section>
  );
}

type LibrariesViewProps = {
  libraries: LibraryItem[];
  loading: boolean;
  servers: ServerProfile[];
};

function LibrariesView({ libraries, loading, servers }: LibrariesViewProps) {
  return (
    <section className="view-stack" aria-labelledby="libraries-title">
      <header className="view-header">
        <div>
          <p className="eyebrow">{servers[0]?.name ?? "No server"}</p>
          <h1 id="libraries-title">Libraries</h1>
        </div>
      </header>

      {servers.length === 0 ? (
        <EmptyState
          icon={Library}
          title="No servers connected"
          value="Add a server in Settings"
        />
      ) : loading ? (
        <EmptyState icon={Film} title="Loading libraries" value={servers[0].name} />
      ) : libraries.length === 0 ? (
        <EmptyState icon={Library} title="No libraries found" value={servers[0].name} />
      ) : (
        <div className="library-grid" aria-label="Media libraries">
          {libraries.map((library) => (
            <FocusableCard
              className="library-card"
              focusScope="library-grid"
              key={library.id}
            >
              <span className="poster-surface" />
              <strong>{library.title}</strong>
              <span>{library.itemType}</span>
            </FocusableCard>
          ))}
        </div>
      )}
    </section>
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

type MediaRailProps = {
  items: Array<{ label: string; value: string }>;
  title: string;
};

function MediaRail({ items, title }: MediaRailProps) {
  return (
    <section className="media-rail" aria-labelledby="today-rail">
      <h2 id="today-rail">{title}</h2>
      <div className="rail-items">
        {items.map((item) => (
          <FocusableCard className="poster-card" focusScope="home-rail" key={item.label}>
            <span className="poster-art" />
            <strong>{item.label}</strong>
            <span>{item.value}</span>
          </FocusableCard>
        ))}
      </div>
    </section>
  );
}

type EmptyStateProps = {
  icon: Icon;
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
