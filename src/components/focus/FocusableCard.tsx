import type {
  ButtonHTMLAttributes,
  KeyboardEvent,
  ReactNode,
} from "react";

type FocusableCardProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  focusScope?: string;
};

const reverseKeys = new Set(["ArrowLeft", "ArrowUp"]);
const forwardKeys = new Set(["ArrowRight", "ArrowDown"]);

export function FocusableCard({
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

    const step = forwardKeys.has(event.key) ? 1 : reverseKeys.has(event.key) ? -1 : 0;

    if (step === 0) {
      return;
    }

    const buttons = Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        `[data-focus-scope="${focusScope}"]:not(:disabled)`,
      ),
    );
    const index = buttons.indexOf(event.currentTarget);
    const nextIndex = (index + step + buttons.length) % buttons.length;
    const next = buttons[nextIndex];

    if (next) {
      event.preventDefault();
      next.focus();
      next.click();
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
