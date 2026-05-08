import { forwardRef, type ReactNode } from "react";
import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";
import {
  cardMotion,
  controlMotion,
  reduceInteractiveMotion,
} from "../../lib/motion/presets";

type MotionButtonProps = HTMLMotionProps<"button"> & {
  children: ReactNode;
  motionKind?: "card" | "control";
};

export const MotionButton = forwardRef<HTMLButtonElement, MotionButtonProps>(
  function MotionButton(
    {
      children,
      disabled,
      motionKind = "control",
      type = "button",
      ...props
    },
    ref,
  ) {
    const reducedMotion = useReducedMotion();
    const preset = motionKind === "card" ? cardMotion : controlMotion;
    const motionProps = reduceInteractiveMotion(
      preset,
      reducedMotion,
      disabled,
    );

    return (
      <motion.button
        disabled={disabled}
        ref={ref}
        type={type}
        {...motionProps}
        {...props}
      >
        {children}
      </motion.button>
    );
  },
);
