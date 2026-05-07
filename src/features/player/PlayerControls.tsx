import {
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Volume2,
  X,
} from "lucide-react";
import { useState } from "react";
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
  const isPaused = session.state === "paused";

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
    <section className="player-controls" aria-label="Playback controls">
      <div>
        <strong>{session.state === "playing" ? "Playing" : titleCase(session.state)}</strong>
        <span>{formatPosition(session.positionSeconds)}</span>
      </div>
      <div className="player-control-buttons">
        <button
          aria-label="Seek back"
          disabled={command.isPending}
          onClick={() =>
            void send({
              kind: "seek",
              positionSeconds: Math.max(0, session.positionSeconds - 10),
            })
          }
          type="button"
        >
          <RotateCcw aria-hidden="true" size={17} />
        </button>
        <button
          aria-label={isPaused ? "Play" : "Pause"}
          disabled={command.isPending}
          onClick={() => void send({ kind: isPaused ? "play" : "pause" })}
          type="button"
        >
          {isPaused ? (
            <Play aria-hidden="true" size={17} />
          ) : (
            <Pause aria-hidden="true" size={17} />
          )}
        </button>
        <button
          aria-label="Seek forward"
          disabled={command.isPending}
          onClick={() =>
            void send({
              kind: "seek",
              positionSeconds: session.positionSeconds + 10,
            })
          }
          type="button"
        >
          <RotateCw aria-hidden="true" size={17} />
        </button>
        <label className="volume-control">
          <Volume2 aria-hidden="true" size={17} />
          <input
            aria-label="Volume"
            max={100}
            min={0}
            onChange={(event) => void handleVolume(Number(event.target.value))}
            type="range"
            value={volume}
          />
        </label>
        <button
          aria-label="Close player"
          disabled={command.isPending}
          onClick={() => void send({ kind: "close" })}
          type="button"
        >
          <X aria-hidden="true" size={17} />
        </button>
      </div>
    </section>
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
