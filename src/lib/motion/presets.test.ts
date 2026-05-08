import { describe, expect, it } from "vitest";
import {
  cardMotion,
  controlMotion,
  createRouteMotion,
  createSurfaceMotion,
} from "./presets";

describe("motion presets", () => {
  it("keeps route transitions spatial when motion is allowed and opacity-only when reduced", () => {
    expect(createRouteMotion(false)).toMatchObject({
      initial: { opacity: 0, scale: 0.992, y: 12 },
      animate: { opacity: 1, scale: 1, y: 0 },
      exit: { opacity: 0, scale: 0.996, y: -8 },
    });

    expect(createRouteMotion(true)).toMatchObject({
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
    });
  });

  it("keeps surface entrances subtle and removes movement for reduced motion", () => {
    expect(createSurfaceMotion(false, 2)).toMatchObject({
      initial: { opacity: 0, y: 12 },
      animate: { opacity: 1, y: 0 },
    });

    expect(createSurfaceMotion(true, 2)).toMatchObject({
      initial: { opacity: 0 },
      animate: { opacity: 1 },
    });
  });

  it("uses restrained hover and press feedback for interactive controls", () => {
    expect(controlMotion).toMatchObject({
      whileHover: { y: -1 },
      whileTap: { scale: 0.985 },
    });

    expect(cardMotion).toMatchObject({
      whileHover: { scale: 1.018, y: -3 },
      whileTap: { scale: 0.992 },
    });
  });
});
