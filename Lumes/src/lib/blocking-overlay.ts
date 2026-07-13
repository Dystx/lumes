import { useEffect, useRef, type RefObject } from "react";
import { trapFocus } from "@/lib/focus-trap";

interface BlockingOverlayEntry {
  onEscape: () => void;
  getContainer: () => HTMLElement | null;
  trapFocus?: boolean;
}

const entries: BlockingOverlayEntry[] = [];
let listenerInstalled = false;

function onKeyDown(event: KeyboardEvent): void {
  const entry = entries.at(-1);
  if (!entry) return;

  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    entry.onEscape();
    return;
  }

  const container = entry.getContainer();
  if (container && entry.trapFocus !== false) trapFocus(container, event);
}

function installListener(): void {
  if (listenerInstalled || typeof window === "undefined") return;
  window.addEventListener("keydown", onKeyDown, true);
  listenerInstalled = true;
}

function removeListener(): void {
  if (!listenerInstalled || typeof window === "undefined") return;
  window.removeEventListener("keydown", onKeyDown, true);
  listenerInstalled = false;
}

export function registerBlockingOverlay(entry: BlockingOverlayEntry): () => void {
  entries.push(entry);
  installListener();
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    const index = entries.indexOf(entry);
    if (index >= 0) entries.splice(index, 1);
    if (entries.length === 0) removeListener();
  };
}

export function registerOverlayEscape(onEscape: () => void): () => void {
  return registerBlockingOverlay({
    getContainer: () => null,
    onEscape,
    trapFocus: false,
  });
}

/** Registers one blocking overlay while keeping the newest overlay topmost. */
export function useBlockingOverlay(
  open: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onEscape: () => void,
): void {
  const onEscapeRef = useRef(onEscape);

  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!open) return;
    return registerBlockingOverlay({
      getContainer: () => containerRef.current,
      onEscape: () => onEscapeRef.current(),
    });
  }, [containerRef, open]);
}

/** Registers Escape ownership without turning a non-modal rail into a focus trap. */
export function useOverlayEscape(open: boolean, onEscape: () => void): void {
  const onEscapeRef = useRef(onEscape);

  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!open) return;
    return registerOverlayEscape(() => onEscapeRef.current());
  }, [open]);
}
