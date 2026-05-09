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

export function focusAdjacentScope(
  scope: string,
  current: HTMLButtonElement,
  direction: FocusDirection,
) {
  if (direction !== "down" && direction !== "up") {
    return false;
  }

  const items = getFocusableItems(scope);
  const index = items.indexOf(current);
  if (index === -1) {
    return false;
  }

  const roots = getScopeRootsWithItems();
  const currentRootIndex = roots.findIndex(
    (root) => root.dataset.focusScopeRoot === scope,
  );
  if (currentRootIndex === -1) {
    return false;
  }

  const adjacentRoot =
    findAdjacentScopeByGeometry(roots, roots[currentRootIndex], current, direction) ??
    findAdjacentScopeByDomOrder(roots, currentRootIndex, direction);
  if (!adjacentRoot) {
    return false;
  }

  const targetItems = getFocusableItems(adjacentRoot.dataset.focusScopeRoot ?? "");
  const target = findNearestHorizontalItem(targetItems, current) ??
    targetItems[Math.min(index, targetItems.length - 1)];

  if (!target) {
    return false;
  }

  focusElement(target);
  return true;
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

function getScopeRootsWithItems() {
  return Array.from(
    document.querySelectorAll<HTMLElement>("[data-focus-scope-root]"),
  ).filter((root) => {
    const scope = root.dataset.focusScopeRoot;
    return scope ? getFocusableItems(scope).length > 0 : false;
  });
}

function findAdjacentScopeByGeometry(
  roots: HTMLElement[],
  currentRoot: HTMLElement,
  current: HTMLButtonElement,
  direction: "down" | "up",
) {
  const currentRect = current.getBoundingClientRect();
  const currentRootRect = currentRoot.getBoundingClientRect();

  if (!hasLayout(currentRect) || !hasLayout(currentRootRect)) {
    return null;
  }

  const candidates = roots
    .filter((root) => root !== currentRoot)
    .map((root) => ({ rect: root.getBoundingClientRect(), root }))
    .filter(({ rect }) => {
      if (!hasLayout(rect)) {
        return false;
      }

      return direction === "down"
        ? rect.top >= currentRootRect.bottom
        : rect.bottom <= currentRootRect.top;
    })
    .sort((a, b) =>
      direction === "down"
        ? a.rect.top - b.rect.top
        : b.rect.bottom - a.rect.bottom,
    );

  return candidates[0]?.root ?? null;
}

function findAdjacentScopeByDomOrder(
  roots: HTMLElement[],
  currentRootIndex: number,
  direction: "down" | "up",
) {
  return direction === "down"
    ? roots[currentRootIndex + 1] ?? null
    : roots[currentRootIndex - 1] ?? null;
}

function findNearestHorizontalItem(
  items: HTMLButtonElement[],
  current: HTMLButtonElement,
) {
  const currentRect = current.getBoundingClientRect();
  if (!hasLayout(currentRect)) {
    return null;
  }

  const currentCenter = centerX(currentRect);
  let closest: HTMLButtonElement | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const item of items) {
    const rect = item.getBoundingClientRect();
    if (!hasLayout(rect)) {
      return null;
    }

    const distance = Math.abs(centerX(rect) - currentCenter);
    if (distance < closestDistance) {
      closest = item;
      closestDistance = distance;
    }
  }

  return closest;
}

function centerX(rect: DOMRect) {
  return rect.left + rect.width / 2;
}

function hasLayout(rect: DOMRect) {
  return rect.width > 0 || rect.height > 0;
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
