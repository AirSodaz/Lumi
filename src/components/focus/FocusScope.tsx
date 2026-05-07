import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  directionFromKey,
  focusFirstInScope,
  hasFocusableItems,
  shouldIgnoreDirectionalKeyTarget,
} from "./directionalFocus";

type FocusScopeProps = {
  "aria-label"?: string;
  children: ReactNode;
  className?: string;
  columns?: number;
  entry?: boolean;
  focusKey?: string | number;
  scope: string;
};

export function FocusScope({
  "aria-label": ariaLabel,
  children,
  className = "",
  columns = 1,
  entry = false,
  focusKey,
  scope,
}: FocusScopeProps) {
  const scopeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const activeElement = document.activeElement;
    const shouldKeepFocus =
      activeElement instanceof HTMLElement &&
      activeElement !== document.body &&
      !scopeRef.current?.contains(activeElement);

    if (shouldKeepFocus || !hasFocusableItems(scope)) {
      return;
    }

    scopeRef.current?.focus({ preventScroll: true });
  }, [focusKey, scope]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (
      event.defaultPrevented ||
      shouldIgnoreDirectionalKeyTarget(event.target)
    ) {
      return;
    }

    const target = event.target instanceof HTMLElement ? event.target : null;
    if (
      target &&
      target !== event.currentTarget &&
      target.closest("[data-focus-scope]")
    ) {
      return;
    }

    const direction = directionFromKey(event.key);
    if (!direction) {
      return;
    }

    if (focusFirstInScope(scope)) {
      event.preventDefault();
    }
  }

  return (
    <div
      aria-label={ariaLabel}
      className={`focus-scope ${className}`.trim()}
      data-focus-columns={columns}
      data-focus-entry={entry ? "true" : undefined}
      data-focus-scope-root={scope}
      onKeyDown={handleKeyDown}
      ref={scopeRef}
      tabIndex={-1}
    >
      {children}
    </div>
  );
}
