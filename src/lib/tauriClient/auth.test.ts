import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "./auth";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

describe("auth tauri client", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("logs out through the typed command boundary", async () => {
    invokeMock.mockResolvedValueOnce(null);

    await auth.logout({ serverId: "server-1" });

    expect(invokeMock).toHaveBeenCalledWith("auth_logout", {
      request: { serverId: "server-1" },
    });
  });
});
