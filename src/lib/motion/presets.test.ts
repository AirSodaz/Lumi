import { describe, expect, it } from "vitest";
import {
  cardMotion,
  controlMotion,
  createRouteMotion,
  createSurfaceMotion,
  navMotion,
} from "./presets";

describe("motion presets", () => {
  it("keeps route transitions opacity-only so shell navigation stays stable", () => {
    const fullMotion = createRouteMotion(false);
    expect(fullMotion).toMatchObject({
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
    });
    expect(fullMotion.initial).not.toHaveProperty("scale");
    expect(fullMotion.initial).not.toHaveProperty("y");
    expect(fullMotion.animate).not.toHaveProperty("scale");
    expect(fullMotion.animate).not.toHaveProperty("y");
    expect(fullMotion.exit).not.toHaveProperty("scale");
    expect(fullMotion.exit).not.toHaveProperty("y");

    const reducedMotion = createRouteMotion(true);
    expect(reducedMotion).toMatchObject({
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
    });
    expect(reducedMotion.initial).not.toHaveProperty("scale");
    expect(reducedMotion.initial).not.toHaveProperty("y");
    expect(reducedMotion.animate).not.toHaveProperty("scale");
    expect(reducedMotion.animate).not.toHaveProperty("y");
    expect(reducedMotion.exit).not.toHaveProperty("scale");
    expect(reducedMotion.exit).not.toHaveProperty("y");
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

  it("keeps source-list navigation hover feedback flat", () => {
    expect(navMotion).toMatchObject({
      whileHover: { opacity: 1 },
      whileFocus: { opacity: 1 },
      whileTap: { opacity: 0.92 },
    });
    expect(navMotion.whileHover).not.toHaveProperty("y");
    expect(navMotion.whileHover).not.toHaveProperty("scale");
    expect(navMotion.whileFocus).not.toHaveProperty("y");
    expect(navMotion.whileFocus).not.toHaveProperty("scale");
  });
});
