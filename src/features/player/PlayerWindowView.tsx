import { useEffect, useRef, useState } from "react";
import { Film } from "lucide-react";
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
  sessionId: string;
};

export function PlayerWindowView({ sessionId }: PlayerWindowViewProps) {
  const { translate } = useI18n();
  const sessionQuery = usePlaybackSession(sessionId);
  const closeCommand = usePlaybackCommand();
  const [session, setSession] = useState<PlayerSession | null>(null);
  const [playbackError, setPlaybackError] = useState<AppError | null>(null);
  const closeSent = useRef(false);

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
    const unlistenTask = currentWindow.onCloseRequested(() => {
      if (closeSent.current || !sessionId) {
        return;
      }

      closeSent.current = true;
      void closeCommand.mutateAsync({
        sessionId,
        command: { kind: "close" },
      });
    });

    return () => {
      disposed = true;
      void unlistenTask.then((unlisten) => {
        if (disposed) {
          unlisten();
        }
      });
    };
  }, [closeCommand, sessionId]);

  function handleSessionChange(nextSession: PlayerSession) {
    setSession(nextSession);
    if (nextSession.state === "closed") {
      void getCurrentWindow().close();
    }
  }

  const activeSession = session ?? sessionQuery.data ?? null;
  const status = activeSession
    ? translate(`player.state.${activeSession.state}`)
    : translate("player.state.opening");

  return (
    <main className="player-window" aria-labelledby="player-window-title">
      <section className="player-video-region" aria-label={translate("player.aria.video")}>
        <div className="player-video-placeholder">
          <Film aria-hidden="true" size={26} />
          <span>
            {activeSession?.state === "playing"
              ? translate("player.video.active")
              : translate("player.video.starting")}
          </span>
        </div>
      </section>

      <section className="player-control-region">
        <div className="player-window-header">
          <div>
            <span>Lumi</span>
            <h1 id="player-window-title">{translate("player.title")}</h1>
          </div>
          <strong>{status}</strong>
        </div>

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
            onSessionChange={handleSessionChange}
            session={activeSession}
          />
        ) : (
          <div className="player-controls" aria-label={translate("player.aria.controls")}>
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
