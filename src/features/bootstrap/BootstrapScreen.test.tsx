import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BootstrapScreen } from "./BootstrapScreen";

describe("BootstrapScreen", () => {
  it("renders the Lumi bootstrap surface with the architecture pillars and status", () => {
    render(<BootstrapScreen status="lumi-bootstrap-ready" />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Lumi" }),
    ).toBeInTheDocument();
    expect(screen.getByText("lumi-bootstrap-ready")).toBeInTheDocument();
    expect(screen.getByText("Emby-first provider")).toBeInTheDocument();
    expect(screen.getByText("Native mpv playback")).toBeInTheDocument();
    expect(screen.getByText("System material shell")).toBeInTheDocument();
  });
});
