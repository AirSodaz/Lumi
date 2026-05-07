export type FocusDirection = "down" | "left" | "right" | "up";

export function directionFromKey(key: string) {
  switch (key) {
    case "ArrowDown":
      return "down";
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    case "ArrowUp":
      return "up";
    default:
      return null;
  }
}

export function focusElement(element: HTMLElement) {
  element.focus({ preventScroll: true });
  element.scrollIntoView?.({ block: "nearest", inline: "nearest" });
}

export function focusFirstContentEntry() {
  const entry = document.querySelector<HTMLElement>('[data-focus-entry="true"]');
  const first = entry?.querySelector<HTMLButtonElement>(
    "[data-focus-scope]:not(:disabled)",
  );

  if (!first) {
    return false;
  }

  focusElement(first);
  return true;
}

export function focusFirstInScope(scope: string) {
  const [first] = getFocusableItems(scope);
  if (!first) {
    return false;
  }

  focusElement(first);
  return true;
}

export function moveFocusInScope(
  scope: string,
  current: HTMLButtonElement,
  direction: FocusDirection,
) {
  const items = getFocusableItems(scope);
  const index = items.indexOf(current);

  if (index === -1 || items.length === 0) {
    return null;
  }

  const nextIndex = nextIndexForDirection(
    index,
    items.length,
    columnsForScope(scope),
    direction,
  );

  if (nextIndex === null) {
    return null;
  }

  const next = items[nextIndex] ?? null;
  if (next) {
    focusElement(next);
  }

  return next;
}

export function isAtScopeBoundary(
  scope: string,
  current: HTMLButtonElement,
  direction: FocusDirection,
) {
  const items = getFocusableItems(scope);
  const index = items.indexOf(current);

  if (index === -1 || items.length === 0) {
    return false;
  }

  return nextIndexForDirection(
    index,
    items.length,
    columnsForScope(scope),
    direction,
  ) === null;
}

export function hasFocusableItems(scope: string) {
  return getFocusableItems(scope).length > 0;
}

export function shouldIgnoreDirectionalKeyTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable="true"], [role="dialog"]',
    ),
  );
}

function getFocusableItems(scope: string) {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>(
      `[data-focus-scope="${scope}"]:not(:disabled)`,
    ),
  );
}

function columnsForScope(scope: string) {
  const root = document.querySelector<HTMLElement>(
    `[data-focus-scope-root="${scope}"]`,
  );
  const columns = Number(root?.dataset.focusColumns);

  return Number.isFinite(columns) && columns > 0 ? Math.floor(columns) : 1;
}

function nextIndexForDirection(
  index: number,
  itemCount: number,
  columns: number,
  direction: FocusDirection,
) {
  const currentColumn = index % columns;

  switch (direction) {
    case "down": {
      const next = index + columns;
      return next < itemCount ? next : null;
    }
    case "left":
      return currentColumn > 0 ? index - 1 : null;
    case "right": {
      const next = index + 1;
      const staysInRow = Math.floor(next / columns) === Math.floor(index / columns);
      return currentColumn < columns - 1 && next < itemCount && staysInRow
        ? next
        : null;
    }
    case "up": {
      const next = index - columns;
      return next >= 0 ? next : null;
    }
  }
}
