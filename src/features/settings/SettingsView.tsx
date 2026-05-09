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
import { useI18n, type LanguagePreference } from "../../lib/i18n";
import { useTheme } from "../../lib/theme";
import {
  createSurfaceMotion,
  dialogContentMotion,
  dialogOverlayMotion,
  dropdownMotion,
} from "../../lib/motion/presets";
import {
  useLoginManual,
  useCreateServerLine,
  useDeleteServerLine,
  useLogout,
  useExportLogs,
  useMaterialState,
  useMpvDiagnostic,
  useSelectServerLine,
  useServers,
  useSettings,
  useUpdateServerLine,
  useUpdateServerProfile,
  useUpdateSettings,
  type AppError,
  type LogExport,
  type ServerLine,
  type ServerProfile,
  type SubtitlePreference,
  type ThemePreference,
} from "../../lib/tauriClient";

type SettingsPanel = "mediaServices" | "player" | "appearance" | "logs";

const panels: Array<{ id: SettingsPanel }> = [
  { id: "mediaServices" },
  { id: "player" },
  { id: "appearance" },
  { id: "logs" },
];

type SettingsViewProps = {
  openAddServerDialog?: boolean;
  onAddServerDialogOpenChange?: (open: boolean) => void;
  onSelectServer: (serverId: string) => void;
  selectedServerId: string | null;
};

function panelLabelKey(panel: SettingsPanel) {
  return `settings.panel.${panel}` as const;
}

function languagePreferenceLabelKey(languagePreference: LanguagePreference) {
  if (languagePreference === "en") {
    return "i18n.language.english";
  }

  if (languagePreference === "zh") {
    return "i18n.language.zh";
  }

  return "i18n.language.system";
}

export function SettingsView({
  openAddServerDialog = false,
  onAddServerDialogOpenChange,
  onSelectServer,
  selectedServerId,
}: SettingsViewProps) {
  const [selectedPanel, setSelectedPanel] = useState<SettingsPanel>("mediaServices");
  const reducedMotion = useReducedMotion();
  const { translate } = useI18n();
  const panel = openAddServerDialog ? "mediaServices" : selectedPanel;

  return (
    <section className="settings-view app-workbench" aria-labelledby="settings-title">
      <h1 className="sr-only" id="settings-title">{translate("settings.title")}</h1>

      <div className="settings-layout">
        <nav className="settings-tabs" aria-label={translate("settings.aria.sections")}>
          {panels.map((item) => (
            <MotionButton
              aria-current={panel === item.id ? "page" : undefined}
              key={item.id}
              onClick={() => setSelectedPanel(item.id)}
              type="button"
            >
              {translate(panelLabelKey(item.id))}
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
            {panel === "mediaServices" ? (
              <ServersPanel
                addServerDialogOpen={openAddServerDialog}
                onAddServerDialogOpenChange={onAddServerDialogOpenChange}
                onSelectServer={onSelectServer}
                selectedServerId={selectedServerId}
              />
            ) : null}
            {panel === "player" ? <PlayerPanel /> : null}
            {panel === "appearance" ? <AppearancePanel /> : null}
            {panel === "logs" ? <LogsPanel /> : null}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

type ServersPanelProps = {
  addServerDialogOpen: boolean;
  onAddServerDialogOpenChange?: (open: boolean) => void;
  onSelectServer: (serverId: string) => void;
  selectedServerId: string | null;
};

function ServersPanel({
  addServerDialogOpen,
  onAddServerDialogOpenChange,
  onSelectServer,
  selectedServerId,
}: ServersPanelProps) {
  const { translate } = useI18n();
  const serversQuery = useServers();
  const logout = useLogout();
  const servers = serversQuery.data ?? [];
  const [viewingServer, setViewingServer] = useState<ServerProfile | null>(null);
  const [renamingServer, setRenamingServer] = useState<ServerProfile | null>(null);

  return (
    <section className="settings-section" aria-labelledby="media-services-title">
      <div className="section-heading">
        <div>
          <h2 id="media-services-title">{translate("settings.panel.mediaServices")}</h2>
          <p>{mediaServicesSavedLabel(servers.length, translate)}</p>
        </div>
        <AddServerDialog
          externalOpen={addServerDialogOpen}
          onExternalOpenChange={onAddServerDialogOpenChange}
        />
      </div>

      <div className="settings-list">
        {servers.map((server) => {
          const isSelected = server.id === selectedServerId;

          return (
            <article className="server-row" key={server.id}>
              <span className="server-icon">
                <Server aria-hidden="true" size={17} />
              </span>
              <div className="server-row-details">
                <strong>{server.name}</strong>
                <span>{server.baseUrl}</span>
                <span>{lineCountLabel(server.lines.length, translate)}</span>
              </div>
              <div className="server-row-actions">
                {isSelected ? (
                  <span className="status-chip server-current-chip">
                    <Check aria-hidden="true" size={14} />
                    <span>{translate("settings.server.current")}</span>
                  </span>
                ) : (
                  <MotionButton
                    className="secondary-action server-current-action"
                    onClick={() => onSelectServer(server.id)}
                    type="button"
                  >
                    {translate("settings.action.setCurrentServer")}
                  </MotionButton>
                )}
                <DropdownMenu.Root>
                  <Tooltip.Root>
                    <Tooltip.Trigger asChild>
                      <DropdownMenu.Trigger asChild>
                        <MotionButton
                          aria-label={translate("settings.action.moreActionsFor", {
                            name: server.name,
                          })}
                          className="server-menu-button"
                          type="button"
                        >
                          <MoreHorizontal aria-hidden="true" size={16} />
                        </MotionButton>
                      </DropdownMenu.Trigger>
                    </Tooltip.Trigger>
                    <Tooltip.Portal>
                      <Tooltip.Content className="tooltip-content" side="left">
                        {translate("settings.action.moreActionsFor", { name: server.name })}
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
                        <DropdownMenu.Item
                          className="dropdown-item"
                          onSelect={() => setViewingServer(server)}
                        >
                          {translate("settings.action.viewServer")}
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                          className="dropdown-item"
                          onSelect={() => setRenamingServer(server)}
                        >
                          {translate("settings.action.rename")}
                        </DropdownMenu.Item>
                        <DropdownMenu.Item className="dropdown-item">
                          {translate("settings.action.diagnostics")}
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                          className="dropdown-item"
                          onSelect={() => logout.mutate({ serverId: server.id })}
                        >
                          {translate("settings.action.signOut")}
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                          className="dropdown-item danger"
                          onSelect={() => logout.mutate({ serverId: server.id })}
                        >
                          {translate("settings.action.deleteServer")}
                        </DropdownMenu.Item>
                      </motion.div>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              </div>
            </article>
          );
        })}
        {servers.length === 0 ? (
          <GlassPanel className="empty-state compact">
            <Server aria-hidden="true" size={22} />
            <strong>{translate("settings.server.empty.title")}</strong>
            <span>{translate("settings.server.empty.subtitle")}</span>
          </GlassPanel>
        ) : null}
      </div>
      <ServerDetailDialog
        onOpenChange={(open) => {
          if (!open) {
            setViewingServer(null);
          }
        }}
        server={viewingServer}
      />
      <RenameServerDialog
        onOpenChange={(open) => {
          if (!open) {
            setRenamingServer(null);
          }
        }}
        server={renamingServer}
      />
    </section>
  );
}

type AddServerDialogProps = {
  externalOpen?: boolean;
  onExternalOpenChange?: (open: boolean) => void;
};

function AddServerDialog({
  externalOpen,
  onExternalOpenChange,
}: AddServerDialogProps) {
  const { translate } = useI18n();
  const [internalOpen, setInternalOpen] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<AppError | null>(null);
  const login = useLoginManual();
  const firstInputRef = useRef<HTMLInputElement>(null);
  const controlled = onExternalOpenChange !== undefined;
  const open = controlled ? Boolean(externalOpen) : internalOpen;

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setError(null);
    }

    onExternalOpenChange?.(nextOpen);
    setInternalOpen(nextOpen);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      const trimmedDisplayName = displayName.trim();
      await login.mutateAsync({
        baseUrl,
        ...(trimmedDisplayName ? { displayName: trimmedDisplayName } : {}),
        username,
        password,
      });
      setDisplayName("");
      setPassword("");
      handleOpenChange(false);
    } catch (caught) {
      setError(toAppError(caught, translate("app.error.unknown")));
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <MotionButton className="primary-action" type="button">
          <Plus aria-hidden="true" size={15} />
          <span>{translate("settings.action.addServer")}</span>
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
                  <Dialog.Title>{translate("settings.dialog.add.title")}</Dialog.Title>
                  <Dialog.Close asChild>
                    <MotionButton
                      aria-label={translate("common.close")}
                      className="icon-button"
                      type="button"
                    >
                      <X aria-hidden="true" size={16} />
                    </MotionButton>
                  </Dialog.Close>
                </div>
                <Dialog.Description className="sr-only">
                  {translate("settings.dialog.add.description")}
                </Dialog.Description>
                <form className="dialog-form" onSubmit={handleSubmit}>
                  <label>
                    <span>{translate("settings.field.serverUrl")}</span>
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
                    <span>{translate("settings.field.serverName")}</span>
                    <input
                      autoComplete="off"
                      onChange={(event) => setDisplayName(event.target.value)}
                      placeholder={translate("settings.field.serverNamePlaceholder")}
                      type="text"
                      value={displayName}
                    />
                  </label>
                  <label>
                    <span>{translate("settings.field.username")}</span>
                    <input
                      autoComplete="username"
                      onChange={(event) => setUsername(event.target.value)}
                      required
                      type="text"
                      value={username}
                    />
                  </label>
                  <label>
                    <span>{translate("settings.field.password")}</span>
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
                        {translate("common.cancel")}
                      </MotionButton>
                    </Dialog.Close>
                    <MotionButton className="primary-action" disabled={login.isPending} type="submit">
                      {login.isPending
                        ? translate("common.connecting")
                        : translate("common.connect")}
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
  const { translate } = useI18n();
  const settings = useSettings();
  const updateSettings = useUpdateSettings();
  const diagnostic = useMpvDiagnostic();
  const current = settings.data ?? defaultSettings();

  function updateDefaultVolume(value: number) {
    updateSettings.mutate({ defaultVolume: Math.max(0, Math.min(100, value)) });
  }

  return (
    <section className="settings-section" aria-labelledby="player-title">
      <div className="section-heading">
        <div>
          <h2 id="player-title">{translate("settings.panel.player")}</h2>
          <p>{translate("settings.player.nativeMpv")}</p>
        </div>
        <MonitorCog aria-hidden="true" size={18} />
      </div>
      <div className="settings-list">
        <label className="settings-row control-row">
          <span>
            <strong>{translate("settings.player.defaultVolume")}</strong>
            <span>{current.player.defaultVolume}%</span>
          </span>
          <input
            aria-label={translate("settings.player.defaultVolume")}
            key={current.player.defaultVolume}
            max={100}
            min={0}
            onBlur={(event) => updateDefaultVolume(Number(event.currentTarget.value))}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                updateDefaultVolume(Number(event.currentTarget.value));
              }
            }}
            type="number"
            defaultValue={current.player.defaultVolume}
          />
        </label>
        <label className="settings-row control-row">
          <span>
            <strong>{translate("settings.player.subtitles")}</strong>
            <span>{subtitleLabel(current.player.subtitlePreference, translate)}</span>
          </span>
          <select
            aria-label={translate("settings.player.subtitlePreference")}
            onChange={(event) =>
              updateSettings.mutate({
                subtitlePreference: event.target.value as SubtitlePreference,
              })
            }
            value={current.player.subtitlePreference}
          >
            <option value="serverDefault">
              {translate("settings.subtitles.serverDefault")}
            </option>
            <option value="always">{translate("settings.subtitles.always")}</option>
            <option value="off">{translate("settings.subtitles.off")}</option>
          </select>
        </label>
        <div className="settings-row">
          <strong>{translate("settings.player.mpvPathDiagnostic")}</strong>
          <span>
            {diagnostic.data?.message ??
              (diagnostic.isLoading
                ? translate("settings.player.mpvChecking")
                : translate("settings.player.diagnosticUnavailable"))}
          </span>
        </div>
      </div>
    </section>
  );
}

function AppearancePanel() {
  const {
    languagePreference,
    setLanguagePreference,
    translate,
  } = useI18n();
  const { setThemePreference, themePreference } = useTheme();
  const settings = useSettings();
  const updateSettings = useUpdateSettings();
  const material = useMaterialState();
  const current = settings.data ?? defaultSettings();

  return (
    <section className="settings-section" aria-labelledby="appearance-title">
      <div className="section-heading">
        <div>
          <h2 id="appearance-title">{translate("settings.panel.appearance")}</h2>
          <p>{translate("settings.appearance.subtitle")}</p>
        </div>
        <SlidersHorizontal aria-hidden="true" size={18} />
      </div>
      <div className="settings-list">
        <label className="settings-row control-row">
          <span>
            <strong>{translate("settings.appearance.theme")}</strong>
            <span>{translate("settings.appearance.themeMode")}</span>
          </span>
          <select
            aria-label={translate("settings.appearance.theme")}
            onChange={(event) =>
              setThemePreference(event.target.value as ThemePreference)
            }
            value={themePreference}
          >
            <option value="system">{translate("settings.theme.system")}</option>
            <option value="light">{translate("settings.theme.light")}</option>
            <option value="dark">{translate("settings.theme.dark")}</option>
          </select>
        </label>
        <label className="settings-row control-row">
          <span>
            <strong>{translate("i18n.language.label")}</strong>
            <span>{translate(languagePreferenceLabelKey(languagePreference))}</span>
          </span>
          <select
            aria-label={translate("i18n.language.label")}
            onChange={(event) =>
              setLanguagePreference(event.target.value as LanguagePreference)
            }
            value={languagePreference}
          >
            <option value="system">{translate("i18n.language.followSystem")}</option>
            <option value="en">{translate("i18n.language.english")}</option>
            <option value="zh">{translate("i18n.language.zh")}</option>
          </select>
        </label>
        <label className="settings-row control-row">
          <span>
            <strong>{translate("settings.appearance.materialEffects")}</strong>
            <span>
              {current.materialEffectsEnabled
                ? translate("common.enabled")
                : translate("common.disabled")}
            </span>
          </span>
          <input
            aria-label={translate("settings.appearance.materialEffects")}
            checked={current.materialEffectsEnabled}
            onChange={(event) =>
              updateSettings.mutate({
                materialEffectsEnabled: event.target.checked,
              })
            }
            type="checkbox"
          />
        </label>
        <div className="settings-row">
          <strong>{materialTitle(material.data?.kind, translate)}</strong>
          <span>
            {material.data?.reason ??
              (material.isLoading
                ? translate("settings.appearance.materialCapabilityChecking")
                : translate("settings.appearance.materialStateUnavailable"))}
          </span>
        </div>
      </div>
    </section>
  );
}

function LogsPanel() {
  const { translate } = useI18n();
  const exportLogs = useExportLogs();
  const [exported, setExported] = useState<LogExport | null>(null);

  async function handleExportLogs() {
    const result = await exportLogs.mutateAsync();
    setExported(result);
  }

  return (
    <section className="settings-section" aria-labelledby="logs-title">
      <div className="section-heading">
        <div>
          <h2 id="logs-title">{translate("settings.panel.logs")}</h2>
          <p>{translate("settings.logs.subtitle")}</p>
        </div>
        <Check aria-hidden="true" size={18} />
      </div>
      <div className="settings-list">
        <div className="settings-row">
          <strong>{translate("settings.logs.status")}</strong>
          <span>
            {exportLogs.isPending
              ? translate("settings.logs.statusExporting")
              : translate("settings.logs.statusReady")}
          </span>
        </div>
        <div className="settings-row">
          <strong>{translate("settings.logs.recent")}</strong>
          <MotionButton
            className="secondary-action"
            disabled={exportLogs.isPending}
            onClick={() => void handleExportLogs()}
            type="button"
          >
            {translate("settings.action.exportLogs")}
          </MotionButton>
        </div>
        {exported ? (
          <GlassPanel
            aria-label={translate("settings.logs.exportedAria")}
            className="log-export"
          >
            <strong>{exported.fileName}</strong>
            <pre>{exported.contents}</pre>
          </GlassPanel>
        ) : null}
      </div>
    </section>
  );
}

type ServerDetailDialogProps = {
  onOpenChange: (open: boolean) => void;
  server: ServerProfile | null;
};

function ServerDetailDialog({ onOpenChange, server }: ServerDetailDialogProps) {
  const { translate } = useI18n();
  const createLine = useCreateServerLine();
  const updateLine = useUpdateServerLine();
  const selectLine = useSelectServerLine();
  const deleteLine = useDeleteServerLine();
  const [lineServer, setLineServer] = useState<ServerProfile | null>(null);
  const [draftMode, setDraftMode] = useState<"closed" | "create" | "edit">("closed");
  const [editingLine, setEditingLine] = useState<ServerLine | null>(null);
  const [lineName, setLineName] = useState("");
  const [lineUrl, setLineUrl] = useState("");
  const [error, setError] = useState<AppError | null>(null);

  const activeServer = lineServer?.id === server?.id ? lineServer : server;

  function resetDraft() {
    setDraftMode("closed");
    setEditingLine(null);
    setLineName("");
    setLineUrl("");
    setError(null);
  }

  function startCreateLine() {
    setDraftMode("create");
    setEditingLine(null);
    setLineName("");
    setLineUrl("");
    setError(null);
  }

  function startEditLine(line: ServerLine) {
    setDraftMode("edit");
    setEditingLine(line);
    setLineName(line.name);
    setLineUrl(line.baseUrl);
    setError(null);
  }

  async function handleLineSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeServer) {
      return;
    }

    const trimmedName = lineName.trim();
    const trimmedUrl = lineUrl.trim();
    if (!trimmedName) {
      setError({
        code: "providers.server_line_name_required",
        message: translate("settings.error.serverLineNameRequired"),
        recoverable: true,
      });
      return;
    }

    try {
      setError(null);
      if (draftMode === "edit" && editingLine) {
        const updated = await updateLine.mutateAsync({
          serverId: activeServer.id,
          lineId: editingLine.id,
          name: trimmedName,
          baseUrl: trimmedUrl,
        });
        setLineServer(updated);
      } else {
        const updated = await createLine.mutateAsync({
          serverId: activeServer.id,
          name: trimmedName,
          baseUrl: trimmedUrl,
        });
        setLineServer(updated);
      }
      resetDraft();
    } catch (caught) {
      setError(toAppError(caught, translate("app.error.unknown")));
    }
  }

  async function handleSelectLine(line: ServerLine) {
    if (!activeServer || line.isActive) {
      return;
    }

    try {
      setError(null);
      const updated = await selectLine.mutateAsync({
        serverId: activeServer.id,
        lineId: line.id,
      });
      setLineServer(updated);
    } catch (caught) {
      setError(toAppError(caught, translate("app.error.unknown")));
    }
  }

  async function handleDeleteLine(line: ServerLine) {
    if (!activeServer) {
      return;
    }

    try {
      setError(null);
      const updated = await deleteLine.mutateAsync({
        serverId: activeServer.id,
        lineId: line.id,
      });
      setLineServer(updated);
    } catch (caught) {
      setError(toAppError(caught, translate("app.error.unknown")));
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setLineServer(null);
      resetDraft();
    }
    onOpenChange(nextOpen);
  }

  const lineMutationPending =
    createLine.isPending ||
    updateLine.isPending ||
    selectLine.isPending ||
    deleteLine.isPending;

  return (
    <Dialog.Root open={Boolean(server)} onOpenChange={handleOpenChange}>
      <AnimatePresence>
        {activeServer ? (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="dialog-overlay"
                data-motion-surface="dialog-overlay"
                {...dialogOverlayMotion}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount>
              <motion.div
                className="dialog-content"
                data-motion-surface="dialog-content"
                {...dialogContentMotion}
              >
                <div className="dialog-title-row">
                  <Dialog.Title>{activeServer.name}</Dialog.Title>
                  <Dialog.Close asChild>
                    <MotionButton
                      aria-label={translate("common.close")}
                      className="icon-button"
                      type="button"
                    >
                      <X aria-hidden="true" size={16} />
                    </MotionButton>
                  </Dialog.Close>
                </div>
                <Dialog.Description className="sr-only">
                  {translate("settings.dialog.detail.description")}
                </Dialog.Description>
                <div className="settings-list">
                  <div className="settings-row">
                    <strong>{translate("settings.field.serverUrl")}</strong>
                    <span>{activeServer.baseUrl}</span>
                  </div>
                  <div className="settings-row">
                    <strong>{translate("settings.field.user")}</strong>
                    <span>{activeServer.userId}</span>
                  </div>
                  <div className="settings-row">
                    <strong>{translate("settings.field.provider")}</strong>
                    <span>{activeServer.providerKind}</span>
                  </div>
                  <div className="server-lines-header">
                    <strong>{translate("settings.server.lines")}</strong>
                    <MotionButton
                      className="secondary-action server-current-action"
                      onClick={startCreateLine}
                      type="button"
                    >
                      {translate("settings.action.addLine")}
                    </MotionButton>
                  </div>
                  <div className="server-lines-list">
                    {activeServer.lines.map((line) => (
                      <article className="server-line-row" key={line.id}>
                        <div className="server-row-details">
                          <strong>{line.name}</strong>
                          <span>{line.baseUrl}</span>
                        </div>
                        <div className="server-row-actions">
                          {line.isActive ? (
                            <span className="status-chip server-current-chip">
                              <Check aria-hidden="true" size={14} />
                              <span>{translate("settings.server.currentLine")}</span>
                            </span>
                          ) : (
                            <MotionButton
                              aria-label={translate("settings.action.useLineFor", {
                                name: line.name,
                              })}
                              className="secondary-action server-current-action"
                              disabled={lineMutationPending}
                              onClick={() => void handleSelectLine(line)}
                              type="button"
                            >
                              {translate("settings.action.useLine")}
                            </MotionButton>
                          )}
                          <MotionButton
                            aria-label={translate("settings.action.editLineFor", {
                              name: line.name,
                            })}
                            className="secondary-action server-current-action"
                            disabled={lineMutationPending}
                            onClick={() => startEditLine(line)}
                            type="button"
                          >
                            {translate("settings.action.editLine")}
                          </MotionButton>
                          <MotionButton
                            aria-label={translate("settings.action.deleteLineFor", {
                              name: line.name,
                            })}
                            className="secondary-action server-current-action danger-action"
                            disabled={lineMutationPending || activeServer.lines.length <= 1}
                            onClick={() => void handleDeleteLine(line)}
                            type="button"
                          >
                            {translate("settings.action.deleteLine")}
                          </MotionButton>
                        </div>
                      </article>
                    ))}
                  </div>
                  {draftMode !== "closed" ? (
                    <form className="dialog-form server-line-form" onSubmit={handleLineSubmit}>
                      <label>
                        <span>{translate("settings.field.lineName")}</span>
                        <input
                          onChange={(event) => setLineName(event.target.value)}
                          required
                          type="text"
                          value={lineName}
                        />
                      </label>
                      <label>
                        <span>{translate("settings.field.lineUrl")}</span>
                        <input
                          autoComplete="url"
                          onChange={(event) => setLineUrl(event.target.value)}
                          required
                          type="url"
                          value={lineUrl}
                        />
                      </label>
                      <div className="dialog-actions">
                        <MotionButton
                          className="secondary-action"
                          onClick={resetDraft}
                          type="button"
                        >
                          {translate("common.cancel")}
                        </MotionButton>
                        <MotionButton
                          className="primary-action"
                          disabled={lineMutationPending}
                          type="submit"
                        >
                          {lineMutationPending
                            ? translate("common.saving")
                            : draftMode === "edit"
                              ? translate("settings.action.saveLine")
                              : translate("settings.action.createLine")}
                        </MotionButton>
                      </div>
                    </form>
                  ) : null}
                  {error ? (
                    <div className="form-error" role="alert">
                      <strong>{lineErrorMessage(error, translate)}</strong>
                      <span>{error.code}</span>
                    </div>
                  ) : null}
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}

type RenameServerDialogProps = {
  onOpenChange: (open: boolean) => void;
  server: ServerProfile | null;
};

function RenameServerDialog({ onOpenChange, server }: RenameServerDialogProps) {
  const { translate } = useI18n();
  const updateServerProfile = useUpdateServerProfile();
  const [name, setName] = useState("");
  const [error, setError] = useState<AppError | null>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  function handleOpenAutoFocus(event: Event) {
    event.preventDefault();
    setName(server?.name ?? "");
    setError(null);
    firstInputRef.current?.focus();
    firstInputRef.current?.select();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!server) {
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError({
        code: "providers.server_name_required",
        message: translate("settings.error.serverNameRequired"),
        recoverable: true,
      });
      return;
    }

    setError(null);
    try {
      await updateServerProfile.mutateAsync({
        serverId: server.id,
        name: trimmedName,
      });
      onOpenChange(false);
    } catch (caught) {
      setError(toAppError(caught, translate("app.error.unknown")));
    }
  }

  return (
    <Dialog.Root open={Boolean(server)} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {server ? (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="dialog-overlay"
                data-motion-surface="dialog-overlay"
                {...dialogOverlayMotion}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount onOpenAutoFocus={handleOpenAutoFocus}>
              <motion.div
                className="dialog-content"
                data-motion-surface="dialog-content"
                {...dialogContentMotion}
              >
                <div className="dialog-title-row">
                  <Dialog.Title>{translate("settings.dialog.rename.title")}</Dialog.Title>
                  <Dialog.Close asChild>
                    <MotionButton
                      aria-label={translate("common.close")}
                      className="icon-button"
                      type="button"
                    >
                      <X aria-hidden="true" size={16} />
                    </MotionButton>
                  </Dialog.Close>
                </div>
                <Dialog.Description className="sr-only">
                  {translate("settings.dialog.rename.description")}
                </Dialog.Description>
                <form className="dialog-form" onSubmit={handleSubmit}>
                  <label>
                    <span>{translate("settings.field.serverName")}</span>
                    <input
                      onChange={(event) => setName(event.target.value)}
                      ref={firstInputRef}
                      required
                      type="text"
                      value={name}
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
                        {translate("common.cancel")}
                      </MotionButton>
                    </Dialog.Close>
                    <MotionButton
                      className="primary-action"
                      disabled={updateServerProfile.isPending}
                      type="submit"
                    >
                      {updateServerProfile.isPending
                        ? translate("common.saving")
                        : translate("common.save")}
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

function defaultSettings() {
  return {
    materialEffectsEnabled: true,
    player: {
      defaultVolume: 100,
      subtitlePreference: "serverDefault" as SubtitlePreference,
    },
    theme: "system" as ThemePreference,
  };
}

function subtitleLabel(
  preference: SubtitlePreference,
  translate: ReturnType<typeof useI18n>["translate"],
) {
  switch (preference) {
    case "always":
      return translate("settings.subtitles.always");
    case "off":
      return translate("settings.subtitles.off");
    case "serverDefault":
    default:
      return translate("settings.subtitles.serverDefault");
  }
}

function materialTitle(
  kind: string | undefined,
  translate: ReturnType<typeof useI18n>["translate"],
) {
  if (kind === "nativeMaterial") {
    return translate("settings.appearance.materials.nativeMaterial");
  }

  if (kind === "contentGlass") {
    return translate("settings.appearance.materials.contentGlass");
  }

  return translate("settings.appearance.materials.fallbackSurface");
}

function lineCountLabel(
  count: number,
  translate: ReturnType<typeof useI18n>["translate"],
) {
  return translate("settings.server.lineCount", { count });
}

function mediaServicesSavedLabel(
  count: number,
  translate: ReturnType<typeof useI18n>["translate"],
) {
  if (count === 0) {
    return translate("settings.mediaServices.zero");
  }

  return translate(
    count === 1
      ? "settings.mediaServices.savedOne"
      : "settings.mediaServices.savedMany",
    { count },
  );
}

function lineErrorMessage(
  error: AppError,
  translate: ReturnType<typeof useI18n>["translate"],
) {
  if (error.code === "providers.server_line_last") {
    return translate("settings.error.serverLineLast");
  }
  if (error.code === "providers.server_line_url_duplicate") {
    return translate("settings.error.serverLineUrlDuplicate");
  }
  if (error.code === "providers.server_line_name_required") {
    return translate("settings.error.serverLineNameRequired");
  }
  return error.message;
}

function toAppError(error: unknown, fallbackMessage: string): AppError {
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
    message: fallbackMessage,
    recoverable: true,
  };
}
