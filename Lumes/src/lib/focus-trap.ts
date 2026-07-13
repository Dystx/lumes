const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function nextFocusIndex(length: number, currentIndex: number, reverse: boolean): number {
  if (length <= 0) return -1;
  if (reverse) return currentIndex <= 0 ? length - 1 : currentIndex - 1;
  return currentIndex >= length - 1 ? 0 : currentIndex + 1;
}

/** Returns the next focusable index, including when the dialog itself owns focus. */
export function focusTrapDestination(length: number, currentIndex: number, reverse: boolean): number {
  if (length <= 0) return -1;
  if (currentIndex < 0) return reverse ? length - 1 : 0;
  return nextFocusIndex(length, currentIndex, reverse);
}

export function trapFocus(container: HTMLElement, event: KeyboardEvent): void {
  if (event.key !== "Tab") return;
  const elements = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  if (elements.length === 0) {
    event.preventDefault();
    container.focus();
    return;
  }
  const currentIndex = elements.indexOf(document.activeElement as HTMLElement);
  if (currentIndex < 0) {
    event.preventDefault();
    elements[focusTrapDestination(elements.length, currentIndex, event.shiftKey)]?.focus();
    return;
  }
  const boundaryIndex = event.shiftKey ? 0 : elements.length - 1;
  if (currentIndex !== boundaryIndex) return;
  event.preventDefault();
  elements[nextFocusIndex(elements.length, currentIndex, event.shiftKey)]?.focus();
}
