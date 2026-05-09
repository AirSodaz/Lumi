import type { TargetAndTransition, Transition } from "motion/react";

const instantTransition = { duration: 0.01 };

export const routeTransition = {
  duration: 0.34,
  ease: [0.22, 1, 0.36, 1],
} satisfies Transition;

export const surfaceTransition = {
  duration: 0.28,
  ease: [0.22, 1, 0.36, 1],
} satisfies Transition;

export const materialSpring = {
  type: "spring",
  stiffness: 420,
  damping: 34,
  mass: 0.82,
} satisfies Transition;

export const controlMotion = {
  transition: materialSpring,
  whileHover: { y: -1 },
  whileFocus: { y: -1 },
  whileTap: { scale: 0.985 },
} satisfies InteractiveMotionPreset;

export const cardMotion = {
  transition: materialSpring,
  whileHover: { scale: 1.018, y: -3 },
  whileFocus: { scale: 1.018, y: -3 },
  whileTap: { scale: 0.992 },
} satisfies InteractiveMotionPreset;

export const dropdownMotion = {
  initial: { opacity: 0, y: -4, scale: 0.985 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: surfaceTransition,
} satisfies MotionState;

export const dialogOverlayMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
} satisfies MotionState;

export const dialogContentMotion = {
  initial: { opacity: 0, scale: 0.965, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.985, y: 4 },
  transition: surfaceTransition,
} satisfies MotionState;

type InteractiveMotionPreset = {
  transition: Transition;
  whileFocus: TargetAndTransition;
  whileHover: TargetAndTransition;
  whileTap: TargetAndTransition;
};

type MotionState = {
  animate: TargetAndTransition;
  exit?: TargetAndTransition;
  initial: TargetAndTransition;
  transition: Transition;
};

export function createRouteMotion(reducedMotion: boolean | null) {
  if (reducedMotion) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: instantTransition,
    } satisfies MotionState;
  }

  return {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: routeTransition,
  } satisfies MotionState;
}

export function createSurfaceMotion(
  reducedMotion: boolean | null,
  order = 0,
) {
  if (reducedMotion) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      transition: instantTransition,
    } satisfies Omit<MotionState, "exit">;
  }

  return {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: {
      ...surfaceTransition,
      delay: Math.min(order * 0.035, 0.14),
    },
  } satisfies Omit<MotionState, "exit">;
}

export function createHeroBackdropMotion(reducedMotion: boolean | null) {
  if (reducedMotion) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 0.94 },
      transition: instantTransition,
    } satisfies Omit<MotionState, "exit">;
  }

  return {
    initial: { opacity: 0, scale: 1.02 },
    animate: { opacity: 0.94, scale: 1.035 },
    transition: {
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1],
    },
  } satisfies Omit<MotionState, "exit">;
}

export function reduceInteractiveMotion(
  preset: InteractiveMotionPreset,
  reducedMotion: boolean | null,
  disabled?: boolean,
) {
  if (disabled) {
    return {
      transition: preset.transition,
      whileFocus: undefined,
      whileHover: undefined,
      whileTap: undefined,
    };
  }

  if (reducedMotion) {
    return {
      transition: instantTransition,
      whileFocus: { opacity: 1 },
      whileHover: { opacity: 1 },
      whileTap: { opacity: 0.92 },
    };
  }

  return preset;
}
