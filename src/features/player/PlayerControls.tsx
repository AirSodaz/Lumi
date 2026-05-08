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
import { createSurfaceMotion } from "../../lib/motion/presets";
import {
  usePlaybackCommand,
  type PlaybackCommand,
  type PlayerSession,
} from "../../lib/tauriClient";

type PlayerControlsProps = {
  onSessionChange: (session: PlayerSession) => void;
  session: PlayerSession;
};

export function PlayerControls({
  onSessionChange,
  session,
}: PlayerControlsProps) {
  const command = usePlaybackCommand();
  const [volume, setVolume] = useState(100);
  const reducedMotion = useReducedMotion();
  const isPaused = session.state === "paused";
  const isOpening = session.state === "opening";

  async function send(nextCommand: PlaybackCommand) {
    const updated = await command.mutateAsync({
      sessionId: session.id,
      command: nextCommand,
    });
    onSessionChange(updated);
  }

  async function handleVolume(nextVolume: number) {
    setVolume(nextVolume);
    await send({ kind: "setVolume", volume: nextVolume });
  }

  return (
    <motion.section
      aria-label="Playback controls"
      className="player-controls"
      data-motion-surface="player-controls"
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
      {...createSurfaceMotion(reducedMotion, 0)}
    >
      <div>
        <strong>{session.state === "playing" ? "Playing" : titleCase(session.state)}</strong>
        <span>{formatPosition(session.positionSeconds)}</span>
      </div>
      <div className="player-control-buttons">
        <MotionButton
          aria-label="Seek back"
          disabled={command.isPending || isOpening}
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
          aria-label={isPaused ? "Play" : "Pause"}
          disabled={command.isPending || isOpening}
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
          aria-label="Seek forward"
          disabled={command.isPending || isOpening}
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
            aria-label="Volume"
            disabled={command.isPending || isOpening}
            max={100}
            min={0}
            onChange={(event) => void handleVolume(Number(event.target.value))}
            type="range"
            value={volume}
          />
        </label>
        <MotionButton
          aria-label="Close player"
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

function formatPosition(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function titleCase(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
