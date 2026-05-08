import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { playback } from "./playback";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

describe("playback tauri client", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("opens playback through the typed command boundary", async () => {
    invokeMock.mockResolvedValueOnce({
      id: "session-1",
      serverId: "server-1",
      itemId: "movie-1",
      state: "playing",
      positionSeconds: 0,
    });

    const session = await playback.open({
      serverId: "server-1",
      itemId: "movie-1",
      mediaSourceId: "source-1",
    });

    expect(session.state).toBe("playing");
    expect(invokeMock).toHaveBeenCalledWith("playback_open", {
      request: {
        serverId: "server-1",
        itemId: "movie-1",
        mediaSourceId: "source-1",
      },
    });
  });

  it("sends tagged playback commands without exposing mpv details", async () => {
    invokeMock.mockResolvedValueOnce({
      id: "session-1",
      serverId: "server-1",
      itemId: "movie-1",
      state: "paused",
      positionSeconds: 0,
    });

    await playback.command({
      sessionId: "session-1",
      command: { kind: "pause" },
    });

    expect(invokeMock).toHaveBeenCalledWith("playback_command", {
      request: {
        sessionId: "session-1",
        command: { kind: "pause" },
      },
    });
  });

  it("loads an existing playback session without source details", async () => {
    invokeMock.mockResolvedValueOnce({
      id: "session-1",
      serverId: "server-1",
      itemId: "movie-1",
      state: "opening",
      positionSeconds: 0,
    });

    const session = await playback.getSession("session-1");

    expect(session.state).toBe("opening");
    expect(JSON.stringify(session)).not.toContain("api_key");
    expect(invokeMock).toHaveBeenCalledWith("playback_get_session", {
      sessionId: "session-1",
    });
  });
});
