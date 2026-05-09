import type {
  KeyboardEvent,
  ReactNode,
} from "react";
import { forwardRef } from "react";
import type { HTMLMotionProps } from "motion/react";
import { MotionButton } from "../motion";
import {
  directionFromKey,
  moveFocusInScope,
} from "./directionalFocus";

type FocusableCardProps = Omit<HTMLMotionProps<"button">, "children"> & {
  activateOnArrow?: boolean;
  children: ReactNode;
  focusScope?: string;
  motionKind?: "card" | "control" | "nav";
};

export const FocusableCard = forwardRef<HTMLButtonElement, FocusableCardProps>(
  function FocusableCard(
    {
      activateOnArrow = true,
      children,
      className = "",
      focusScope = "default",
      motionKind = "control",
      onKeyDown,
      type = "button",
      ...props
    },
    ref,
  ) {
    function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
      onKeyDown?.(event);

      if (event.defaultPrevented) {
        return;
      }

      const direction = directionFromKey(event.key);

      if (!direction) {
        return;
      }

      const next = moveFocusInScope(focusScope, event.currentTarget, direction);

      if (next) {
        event.preventDefault();
        if (activateOnArrow) {
          next.click();
        }
      }
    }

    return (
      <MotionButton
        className={`focusable-card ${className}`.trim()}
        data-focus-scope={focusScope}
        motionKind={motionKind}
        onKeyDown={handleKeyDown}
        ref={ref}
        type={type}
        {...props}
      >
        {children}
      </MotionButton>
    );
  },
);
