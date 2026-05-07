import type {
  ButtonHTMLAttributes,
  KeyboardEvent,
  ReactNode,
} from "react";
import {
  directionFromKey,
  moveFocusInScope,
} from "./directionalFocus";

type FocusableCardProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  activateOnArrow?: boolean;
  children: ReactNode;
  focusScope?: string;
};

export function FocusableCard({
  activateOnArrow = true,
  children,
  className = "",
  focusScope = "default",
  onKeyDown,
  type = "button",
  ...props
}: FocusableCardProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    onKeyDown?.(event);

    if (event.defaultPrevented) {
      return;
    }

    const step = directionFromKey(event.key);

    if (step === 0) {
      return;
    }

    const next = moveFocusInScope(focusScope, event.currentTarget, step);

    if (next) {
      event.preventDefault();
      if (activateOnArrow) {
        next.click();
      }
    }
  }

  return (
    <button
      className={`focusable-card ${className}`.trim()}
      data-focus-scope={focusScope}
      onKeyDown={handleKeyDown}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}
