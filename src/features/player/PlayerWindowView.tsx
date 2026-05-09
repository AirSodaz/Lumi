import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { Film, Minus, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useI18n } from "../../lib/i18n";
import {
  playback,
  playbackEventToAppError,
  usePlaybackCommand,
  usePlaybackSession,
  type AppError,
  type PlayerSession,
} from "../../lib/tauriClient";
import { PlayerControls } from "./PlayerControls";

type PlayerWindowViewProps = {
  controlsOnly?: boolean;
  sessionId: string;
};

export function PlayerWindowView({ controlsOnly = false, sessionId }: PlayerWindowViewProps) {
  const { translate } = useI18n();
  const sessionQuery = usePlaybackSession(sessionId);
  const closeCommand = usePlaybackCommand();
  const [session, setSession] = useState<PlayerSession | null>(null);
  const [playbackError, setPlaybackError] = useState<AppError | null>(null);
  const [hudActivityTick, setHudActivityTick] = useState(() => Date.now());
  const [hudClockTick, setHudClockTick] = useState(() => Date.now());
  const [hudPinned, setHudPinned] = useState(false);
  const closeSent = useRef(false);
  const videoRegionRef = useRef<HTMLElement | null>(null);

  const destroyWindow = useCallback(() => {
    const currentWindow = getCurrentWindow();
    const destroy = "destroy" in currentWindow ? currentWindow.destroy : undefined;
    if (typeof destroy === "function") {
      void destroy.call(currentWindow);
      return;
    }
    void currentWindow.close();
  }, []);

  useEffect(() => {
    const unlistenTasks = [
      playback.onStateChanged((nextSession) => {
        if (nextSession.id !== sessionId) {
          return;
        }
        setSession(nextSession);
        if (nextSession.state !== "error") {
          setPlaybackError(null);
        }
      }),
      playback.onPosition((event) => {
        if (event.sessionId !== sessionId) {
          return;
        }
        setSession((current) =>
          current ? { ...current, positionSeconds: event.positionSeconds } : current,
        );
      }),
      playback.onError((event) => {
        if (event.sessionId && event.sessionId !== sessionId) {
          return;
        }
        setPlaybackError(playbackEventToAppError(event));
        setSession((current) =>
          current ? { ...current, state: "error" } : current,
        );
      }),
    ];

    return () => {
      void Promise.all(unlistenTasks).then((unlisteners) => {
        unlisteners.forEach((unlisten) => unlisten());
      });
    };
  }, [sessionId]);

  useEffect(() => {
    const currentWindow = getCurrentWindow();
    if (typeof currentWindow.onCloseRequested !== "function") {
      return;
    }

    let disposed = false;
    const unlistenTask = currentWindow.onCloseRequested(async (event) => {
      if (closeSent.current || !sessionId) {
        return;
      }

      event.preventDefault();
      closeSent.current = true;
      try {
        await closeCommand.mutateAsync({
          sessionId,
          command: { kind: "close" },
        });
      } finally {
        destroyWindow();
      }
    });

    return () => {
      disposed = true;
      void unlistenTask.then((unlisten) => {
        if (disposed) {
          unlisten();
        }
      });
    };
  }, [closeCommand, destroyWindow, sessionId]);

  useEffect(() => {
    if (controlsOnly) {
      return;
    }

    const reportBounds = () => {
      const region = videoRegionRef.current;
      if (!region || !sessionId) {
        return;
      }
      const rect = region.getBoundingClientRect();
      const bounds = {
        sessionId,
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
      };
      void playback.updateSurfaceBounds(bounds).catch(() => undefined);
    };

    reportBounds();
    window.addEventListener("resize", reportBounds);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && videoRegionRef.current) {
      resizeObserver = new ResizeObserver(reportBounds);
      resizeObserver.observe(videoRegionRef.current);
    }

    return () => {
      window.removeEventListener("resize", reportBounds);
      resizeObserver?.disconnect();
    };
  }, [controlsOnly, sessionId]);

  function handleSessionChange(nextSession: PlayerSession) {
    setSession(nextSession);
    if (nextSession.state === "closed") {
      destroyWindow();
    }
  }

  function handleCloseFallback(error: AppError) {
    setPlaybackError(error);
    destroyWindow();
  }

  const activeSession = session ?? sessionQuery.data ?? null;
  const status = activeSession
    ? translate(`player.state.${activeSession.state}`)
    : translate("player.state.opening");
  const keepHudVisible =
    hudPinned ||
    Boolean(playbackError) ||
    sessionQuery.isError ||
    !activeSession ||
    activeSession.state === "opening" ||
    activeSession.state === "buffering";
  const hudVisible = keepHudVisible || hudClockTick - hudActivityTick < 2_500;

  const revealHud = useCallback(() => {
    const now = Date.now();
    setHudActivityTick(now);
    setHudClockTick(now);
  }, []);

  useEffect(() => {
    if (keepHudVisible) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setHudClockTick(Date.now());
    }, 2_500);

    return () => window.clearTimeout(timeout);
  }, [activeSession?.state, hudActivityTick, keepHudVisible]);

  function runWindowCommand(command: "close" | "drag" | "minimize" | "toggleMaximize") {
    const currentWindow = getCurrentWindow();
    if (command === "close") {
      void currentWindow.close();
      return;
    }
    if (command === "drag") {
      void currentWindow.startDragging();
      return;
    }
    if (command === "minimize") {
      void currentWindow.minimize();
      return;
    }
    void currentWindow.toggleMaximize();
  }

  function handleDragMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (event.button !== 0 || event.detail > 1) {
      return;
    }
    runWindowCommand("drag");
  }

  function handleDragDoubleClick() {
    runWindowCommand("toggleMaximize");
  }

  return (
    <main
      className={controlsOnly ? "player-window controls-only" : "player-window"}
      aria-labelledby="player-window-title"
      aria-label={translate("player.title")}
      onClick={revealHud}
      onFocusCapture={revealHud}
      onKeyDown={revealHud}
      onMouseDown={revealHud}
      onMouseMove={revealHud}
      onPointerDown={revealHud}
      onPointerMove={revealHud}
    >
      {controlsOnly ? null : (
        <section
          className="player-video-region"
          aria-label={translate("player.aria.video")}
          ref={videoRegionRef}
        >
          <div className="player-video-placeholder">
            <Film aria-hidden="true" size={26} />
            <span>
              {activeSession?.state === "playing"
                ? translate("player.video.active")
                : translate("player.video.starting")}
            </span>
          </div>
        </section>
      )}

      {controlsOnly ? null : (
        <div
          className="player-window-drag-region"
          onDoubleClick={handleDragDoubleClick}
          onMouseDown={handleDragMouseDown}
        />
      )}

      <section
        className="player-control-region"
        data-testid="player-hud-region"
        data-visible={hudVisible}
        onFocusCapture={() => setHudPinned(true)}
        onBlurCapture={() => setHudPinned(false)}
        onMouseEnter={() => setHudPinned(true)}
        onMouseLeave={() => setHudPinned(false)}
      >
        <div className="player-window-header">
          <div>
            <span>Lumi</span>
            <h1 id="player-window-title">{translate("player.title")}</h1>
          </div>
          <strong>{status}</strong>
        </div>

        {controlsOnly ? null : (
          <div
            className="player-window-controls"
            aria-label={translate("player.aria.windowControls")}
          >
            <button
              aria-label={translate("player.aria.minimize")}
              onClick={() => runWindowCommand("minimize")}
              type="button"
            >
              <Minus aria-hidden="true" size={14} />
            </button>
            <button
              aria-label={translate("player.aria.maximizeRestore")}
              onClick={() => runWindowCommand("toggleMaximize")}
              type="button"
            >
              <Square aria-hidden="true" size={12} />
            </button>
            <button
              aria-label={translate("player.aria.closeWindow")}
              className="close"
              onClick={() => runWindowCommand("close")}
              type="button"
            >
              <X aria-hidden="true" size={16} />
            </button>
          </div>
        )}

        {playbackError ? (
          <div className="form-error playback-error" role="alert">
            <strong>{playbackError.message}</strong>
            <span>{playbackError.code}</span>
          </div>
        ) : null}

        {sessionQuery.isError && !activeSession ? (
          <div className="form-error playback-error" role="alert">
            <strong>{translate("player.error.sessionLoad")}</strong>
            <span>playback.session_not_found</span>
          </div>
        ) : null}

        {activeSession ? (
          <PlayerControls
            className="player-controls-hud"
            onCloseError={handleCloseFallback}
            onSessionChange={handleSessionChange}
            session={activeSession}
          />
        ) : (
          <div
            className="player-controls player-controls-hud"
            aria-label={translate("player.aria.controls")}
          >
            <div>
              <strong>{translate("player.state.opening")}</strong>
              <span>0:00</span>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
