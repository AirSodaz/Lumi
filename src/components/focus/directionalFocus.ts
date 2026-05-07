const reverseKeys = new Set(["ArrowLeft", "ArrowUp"]);
const forwardKeys = new Set(["ArrowRight", "ArrowDown"]);

export function directionFromKey(key: string) {
  if (forwardKeys.has(key)) {
    return 1;
  }

  if (reverseKeys.has(key)) {
    return -1;
  }

  return 0;
}

export function focusFirstInScope(scope: string) {
  const [first] = getFocusableItems(scope);
  if (!first) {
    return false;
  }

  first.focus({ preventScroll: true });
  return true;
}

export function moveFocusInScope(
  scope: string,
  current: HTMLButtonElement,
  step: number,
) {
  const items = getFocusableItems(scope);
  const index = items.indexOf(current);

  if (index === -1 || items.length === 0) {
    return null;
  }

  const nextIndex = (index + step + items.length) % items.length;
  const next = items[nextIndex] ?? null;
  next?.focus({ preventScroll: true });
  return next;
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
