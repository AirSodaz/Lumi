import {
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Volume2,
  X,
} from "lucide-react";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { MotionButton } from "../../components/motion";
import { useI18n } from "../../lib/i18n";
import { createSurfaceMotion } from "../../lib/motion/presets";
import {
  usePlaybackCommand,
  type AppError,
  type PlaybackCommand,
  type PlayerSession,
} from "../../lib/tauriClient";

type PlayerControlsProps = {
  className?: string;
  onCloseError?: (error: AppError) => void;
  onSessionChange: (session: PlayerSession) => void;
  session: PlayerSession;
};

export function PlayerControls({
  className,
  onCloseError,
  onSessionChange,
  session,
}: PlayerControlsProps) {
  const command = usePlaybackCommand();
  const [volume, setVolume] = useState(100);
  const reducedMotion = useReducedMotion();
  const { translate } = useI18n();
  const isPaused = session.state === "paused";
  const isLoading = session.state === "opening" || session.state === "buffering";

  async function send(nextCommand: PlaybackCommand) {
    try {
      const updated = await command.mutateAsync({
        sessionId: session.id,
        command: nextCommand,
      });
      onSessionChange(updated);
    } catch (error) {
      if (nextCommand.kind === "close" && onCloseError) {
        onCloseError(normalizePlaybackCommandError(error));
        return;
      }
      throw error;
    }
  }

  async function handleVolume(nextVolume: number) {
    setVolume(nextVolume);
    await send({ kind: "setVolume", volume: nextVolume });
  }

  return (
    <motion.section
      aria-label={translate("player.aria.controls")}
      className={["player-controls", className].filter(Boolean).join(" ")}
      data-motion-surface="player-controls"
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
      {...createSurfaceMotion(reducedMotion, 0)}
    >
      <div className="player-control-status">
        <strong>{translatePlayerState(session.state, translate)}</strong>
        <span>{formatPosition(session.positionSeconds)}</span>
      </div>
      <div className="player-progress-track" aria-hidden="true">
        <span />
      </div>
      <div className="player-control-buttons">
        <MotionButton
          aria-label={translate("player.aria.seekBack")}
          disabled={command.isPending || isLoading}
          onClick={() =>
            void send({
              kind: "seek",
              positionSeconds: Math.max(0, session.positionSeconds - 10),
            })
          }
          type="button"
        >
          <RotateCcw aria-hidden="true" size={15} />
        </MotionButton>
        <MotionButton
          aria-label={isPaused ? translate("player.aria.play") : translate("player.aria.pause")}
          disabled={command.isPending || isLoading}
          onClick={() => void send({ kind: isPaused ? "play" : "pause" })}
          type="button"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              initial={{ opacity: 0, scale: 0.92 }}
              key={isPaused ? "play" : "pause"}
              transition={reducedMotion ? { duration: 0.01 } : { duration: 0.14 }}
            >
              {isPaused ? (
                <Play aria-hidden="true" size={15} />
              ) : (
                <Pause aria-hidden="true" size={15} />
              )}
            </motion.span>
          </AnimatePresence>
        </MotionButton>
        <MotionButton
          aria-label={translate("player.aria.seekForward")}
          disabled={command.isPending || isLoading}
          onClick={() =>
            void send({
              kind: "seek",
              positionSeconds: session.positionSeconds + 10,
            })
          }
          type="button"
        >
          <RotateCw aria-hidden="true" size={15} />
        </MotionButton>
        <label className="volume-control">
          <Volume2 aria-hidden="true" size={15} />
          <input
            aria-label={translate("player.aria.volume")}
            disabled={command.isPending || isLoading}
            max={100}
            min={0}
            onChange={(event) => void handleVolume(Number(event.target.value))}
            type="range"
            value={volume}
          />
        </label>
        <MotionButton
          aria-label={translate("player.aria.close")}
          disabled={command.isPending}
          onClick={() => void send({ kind: "close" })}
          type="button"
        >
          <X aria-hidden="true" size={15} />
        </MotionButton>
      </div>
    </motion.section>
  );
}

function normalizePlaybackCommandError(error: unknown): AppError {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error
  ) {
    return {
      code: String((error as { code: unknown }).code),
      message: String((error as { message: unknown }).message),
      recoverable:
        "recoverable" in error
          ? Boolean((error as { recoverable: unknown }).recoverable)
          : true,
    };
  }

  return {
    code: "playback.command_failed",
    message: "Native mpv command failed",
    recoverable: true,
  };
}

function formatPosition(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function translatePlayerState(
  state: PlayerSession["state"],
  translate: ReturnType<typeof useI18n>["translate"],
) {
  return translate(`player.state.${state}`);
}
