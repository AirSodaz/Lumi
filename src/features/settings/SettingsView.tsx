import { FormEvent, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Tooltip from "@radix-ui/react-tooltip";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Check,
  MonitorCog,
  MoreHorizontal,
  Plus,
  Server,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { GlassPanel } from "../../components/layout";
import { MotionButton } from "../../components/motion";
import {
  createSurfaceMotion,
  dialogContentMotion,
  dialogOverlayMotion,
  dropdownMotion,
} from "../../lib/motion/presets";
import {
  useLoginManual,
  useServers,
  useSettings,
  useUpdateSettings,
  type AppError,
  type ThemePreference,
} from "../../lib/tauriClient";

type SettingsPanel = "servers" | "player" | "appearance" | "logs";

const panels: Array<{ id: SettingsPanel; label: string }> = [
  { id: "servers", label: "Servers" },
  { id: "player", label: "Player" },
  { id: "appearance", label: "Appearance" },
  { id: "logs", label: "Logs" },
];

export function SettingsView() {
  const [panel, setPanel] = useState<SettingsPanel>("servers");
  const reducedMotion = useReducedMotion();

  return (
    <section className="settings-view app-workbench" aria-labelledby="settings-title">
      <header className="workbench-header">
        <div className="workbench-title-block">
          <span className="workbench-kicker">Lumi</span>
          <h1 id="settings-title">Settings</h1>
          <div className="workbench-meta-row">
            <span>{panels.find((item) => item.id === panel)?.label}</span>
            <span>Local preferences</span>
          </div>
        </div>
      </header>

      <div className="settings-layout">
        <nav className="settings-tabs" aria-label="Settings sections">
          {panels.map((item) => (
            <MotionButton
              aria-current={panel === item.id ? "page" : undefined}
              key={item.id}
              onClick={() => setPanel(item.id)}
              type="button"
            >
              {item.label}
            </MotionButton>
          ))}
        </nav>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            className="settings-panel"
            data-motion-surface="settings-panel"
            key={panel}
            {...createSurfaceMotion(reducedMotion, 0)}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
          >
            {panel === "servers" ? <ServersPanel /> : null}
            {panel === "player" ? <PlayerPanel /> : null}
            {panel === "appearance" ? <AppearancePanel /> : null}
            {panel === "logs" ? <LogsPanel /> : null}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

function ServersPanel() {
  const serversQuery = useServers();
  const servers = serversQuery.data ?? [];

  return (
    <section className="settings-section" aria-labelledby="servers-title">
      <div className="section-heading">
        <div>
          <h2 id="servers-title">Servers</h2>
          <p>{servers.length > 0 ? `${servers.length} saved` : "No saved servers"}</p>
        </div>
        <AddServerDialog />
      </div>

      <div className="settings-list">
        {servers.map((server) => (
          <article className="server-row" key={server.id}>
            <span className="server-icon">
              <Server aria-hidden="true" size={17} />
            </span>
            <div>
              <strong>{server.name}</strong>
              <span>{server.baseUrl}</span>
            </div>
            <DropdownMenu.Root>
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <DropdownMenu.Trigger asChild>
                    <MotionButton aria-label={`More actions for ${server.name}`} type="button">
                      <MoreHorizontal aria-hidden="true" size={16} />
                    </MotionButton>
                  </DropdownMenu.Trigger>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content className="tooltip-content" side="left">
                    More actions
                    <Tooltip.Arrow className="tooltip-arrow" />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" asChild>
                  <motion.div
                    className="dropdown-content"
                    data-motion-surface="dropdown"
                    {...dropdownMotion}
                  >
                    <DropdownMenu.Item className="dropdown-item">View Server</DropdownMenu.Item>
                    <DropdownMenu.Item className="dropdown-item">Diagnostics</DropdownMenu.Item>
                  </motion.div>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </article>
        ))}
        {servers.length === 0 ? (
          <GlassPanel className="empty-state compact">
            <Server aria-hidden="true" size={22} />
            <strong>No servers connected</strong>
            <span>Add Server</span>
          </GlassPanel>
        ) : null}
      </div>
    </section>
  );
}

function AddServerDialog() {
  const [open, setOpen] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<AppError | null>(null);
  const login = useLoginManual();
  const firstInputRef = useRef<HTMLInputElement>(null);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setError(null);
    }

    setOpen(nextOpen);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      await login.mutateAsync({ baseUrl, username, password });
      setPassword("");
      setOpen(false);
    } catch (caught) {
      setError(toAppError(caught));
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <MotionButton className="primary-action" type="button">
          <Plus aria-hidden="true" size={15} />
          <span>Add Server</span>
        </MotionButton>
      </Dialog.Trigger>
      <AnimatePresence>
        {open ? (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="dialog-overlay"
                data-motion-surface="dialog-overlay"
                {...dialogOverlayMotion}
              />
            </Dialog.Overlay>
            <Dialog.Content
              asChild
              forceMount
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                firstInputRef.current?.focus();
              }}
            >
              <motion.div
                className="dialog-content"
                data-motion-surface="dialog-content"
                {...dialogContentMotion}
              >
                <div className="dialog-title-row">
                  <Dialog.Title>Add Emby Server</Dialog.Title>
                  <Dialog.Close asChild>
                    <MotionButton aria-label="Close" className="icon-button" type="button">
                      <X aria-hidden="true" size={16} />
                    </MotionButton>
                  </Dialog.Close>
                </div>
                <Dialog.Description className="sr-only">
                  Sign in to an Emby server with a manual URL.
                </Dialog.Description>
                <form className="dialog-form" onSubmit={handleSubmit}>
                  <label>
                    <span>Server URL</span>
                    <input
                      autoComplete="url"
                      onChange={(event) => setBaseUrl(event.target.value)}
                      ref={firstInputRef}
                      required
                      type="url"
                      value={baseUrl}
                    />
                  </label>
                  <label>
                    <span>Username</span>
                    <input
                      autoComplete="username"
                      onChange={(event) => setUsername(event.target.value)}
                      required
                      type="text"
                      value={username}
                    />
                  </label>
                  <label>
                    <span>Password</span>
                    <input
                      autoComplete="current-password"
                      onChange={(event) => setPassword(event.target.value)}
                      type="password"
                      value={password}
                    />
                  </label>
                  {error ? (
                    <div className="form-error" role="alert">
                      <strong>{error.message}</strong>
                      <span>{error.code}</span>
                    </div>
                  ) : null}
                  <div className="dialog-actions">
                    <Dialog.Close asChild>
                      <MotionButton className="secondary-action" type="button">
                        Cancel
                      </MotionButton>
                    </Dialog.Close>
                    <MotionButton className="primary-action" disabled={login.isPending} type="submit">
                      {login.isPending ? "Connecting" : "Connect"}
                    </MotionButton>
                  </div>
                </form>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}

function PlayerPanel() {
  return (
    <section className="settings-section" aria-labelledby="player-title">
      <div className="section-heading">
        <div>
          <h2 id="player-title">Player</h2>
          <p>Native mpv</p>
        </div>
        <MonitorCog aria-hidden="true" size={18} />
      </div>
      <div className="settings-list">
        <div className="settings-row">
          <strong>Default volume</strong>
          <span>100%</span>
        </div>
        <div className="settings-row">
          <strong>Subtitles</strong>
          <span>Server default</span>
        </div>
      </div>
    </section>
  );
}

function AppearancePanel() {
  const settings = useSettings();
  const updateSettings = useUpdateSettings();
  const current = settings.data ?? {
    theme: "system" as ThemePreference,
    materialEffectsEnabled: true,
  };

  return (
    <section className="settings-section" aria-labelledby="appearance-title">
      <div className="section-heading">
        <div>
          <h2 id="appearance-title">Appearance</h2>
          <p>Content glass</p>
        </div>
        <SlidersHorizontal aria-hidden="true" size={18} />
      </div>
      <div className="settings-list">
        <label className="settings-row control-row">
          <span>
            <strong>Theme</strong>
            <span>System color mode</span>
          </span>
          <select
            aria-label="Theme"
            onChange={(event) =>
              updateSettings.mutate({
                theme: event.target.value as ThemePreference,
              })
            }
            value={current.theme}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <label className="settings-row control-row">
          <span>
            <strong>Material Effects</strong>
            <span>{current.materialEffectsEnabled ? "Enabled" : "Disabled"}</span>
          </span>
          <input
            aria-label="Material Effects"
            checked={current.materialEffectsEnabled}
            onChange={(event) =>
              updateSettings.mutate({
                materialEffectsEnabled: event.target.checked,
              })
            }
            type="checkbox"
          />
        </label>
      </div>
    </section>
  );
}

function LogsPanel() {
  return (
    <section className="settings-section" aria-labelledby="logs-title">
      <div className="section-heading">
        <div>
          <h2 id="logs-title">Logs</h2>
          <p>Recent diagnostics</p>
        </div>
        <Check aria-hidden="true" size={18} />
      </div>
      <div className="settings-list">
        <div className="settings-row">
          <strong>Status</strong>
          <span>Clean</span>
        </div>
      </div>
    </section>
  );
}

function toAppError(error: unknown): AppError {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error
  ) {
    return error as AppError;
  }

  return {
    code: "app.unknown",
    message: "Something went wrong",
    recoverable: true,
  };
}
