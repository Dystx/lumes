"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { trapFocus } from "@/lib/focus-trap";
import {
  resolveKeyboardShortcut,
  type KeyboardShortcutTarget,
} from "@/lib/keyboard-shortcuts";

export interface UseKeyboardShortcutsOptions {
  showShortcuts: boolean;
  setShowShortcuts: (open: boolean) => void;
  hasOpenOverlay: boolean;
  selectedIncidentId: string | null;
  incidentFocusActive: boolean;
  closeTopOverlay: () => string | null;
  exitIncidentFocus: () => void;
  closeIncident: () => void;
  refresh: () => void;
  toggleFollow: (id: string) => void | Promise<unknown>;
  locateIncident: (id: string) => void;
}

export interface UseKeyboardShortcutsResult {
  searchInputRef: RefObject<HTMLInputElement | null>;
  shortcutsPanelRef: RefObject<HTMLDivElement | null>;
}

function targetKind(target: EventTarget | null): KeyboardShortcutTarget {
  if (!(target instanceof HTMLElement)) return "other";
  if (target.tagName === "INPUT") return "input";
  if (target.tagName === "TEXTAREA") return "textarea";
  if (target.tagName === "SELECT") return "select";
  if (target.isContentEditable || target.getAttribute("role") === "textbox") return "editable";
  return "other";
}

export function useKeyboardShortcuts({
  showShortcuts,
  setShowShortcuts,
  hasOpenOverlay,
  selectedIncidentId,
  incidentFocusActive,
  closeTopOverlay,
  exitIncidentFocus,
  closeIncident,
  refresh,
  toggleFollow,
  locateIncident,
}: UseKeyboardShortcutsOptions): UseKeyboardShortcutsResult {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const shortcutsPanelRef = useRef<HTMLDivElement>(null);
  const shortcutsOpenerRef = useRef<HTMLElement | null>(null);
  const latestRef = useRef({
    hasOpenOverlay,
    selectedIncidentId,
    incidentFocusActive,
    showShortcuts,
    setShowShortcuts,
    closeTopOverlay,
    exitIncidentFocus,
    closeIncident,
    refresh,
    toggleFollow,
    locateIncident,
  });
  useEffect(() => {
    latestRef.current = {
      hasOpenOverlay,
      selectedIncidentId,
      incidentFocusActive,
      showShortcuts,
      setShowShortcuts,
      closeTopOverlay,
      exitIncidentFocus,
      closeIncident,
      refresh,
      toggleFollow,
      locateIncident,
    };
  });

  useLayoutEffect(() => {
    if (!showShortcuts) return;
    shortcutsOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Focus before the overlay can paint so keyboard users do not observe a
    // visible dialog with focus still sitting behind it. Keep the frame retry
    // for animated mounts where the ref is attached one commit later.
    shortcutsPanelRef.current?.focus();
    const focusTimer = requestAnimationFrame(() => shortcutsPanelRef.current?.focus());
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setShowShortcuts(false);
        return;
      }
      if (shortcutsPanelRef.current) trapFocus(shortcutsPanelRef.current, event);
    };
    window.addEventListener("keydown", handler, true);
    return () => {
      cancelAnimationFrame(focusTimer);
      window.removeEventListener("keydown", handler, true);
      shortcutsOpenerRef.current?.focus();
    };
  }, [setShowShortcuts, showShortcuts]);

  useLayoutEffect(() => {
    if (showShortcuts) return;
    const opener = shortcutsOpenerRef.current;
    if (!opener) return;
    // AnimatePresence keeps the closing panel mounted briefly. Restore focus
    // on the next frame as well as in the opening effect cleanup so the exit
    // transition cannot leave keyboard focus on <body>.
    const restoreTimer = requestAnimationFrame(() => opener.focus());
    return () => cancelAnimationFrame(restoreTimer);
  }, [showShortcuts]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const current = latestRef.current;
      const intent = resolveKeyboardShortcut({
        key: event.key,
        target: targetKind(event.target),
        defaultPrevented: event.defaultPrevented,
        hasOpenOverlay: current.hasOpenOverlay,
        incidentFocusActive: current.incidentFocusActive,
        hasSelectedIncident: current.selectedIncidentId !== null,
      });

      switch (intent) {
        case "blur-input":
          if (event.target instanceof HTMLElement) event.target.blur();
          return;
        case "close-overlay":
          current.closeTopOverlay();
          return;
        case "exit-incident-focus":
          event.preventDefault();
          current.exitIncidentFocus();
          return;
        case "close-incident":
          current.closeIncident();
          return;
        case "focus-search":
          event.preventDefault();
          searchInputRef.current?.focus();
          return;
        case "refresh":
          current.refresh();
          return;
        case "toggle-follow":
          if (current.selectedIncidentId) current.toggleFollow(current.selectedIncidentId);
          return;
        case "locate-incident":
          if (current.selectedIncidentId) current.locateIncident(current.selectedIncidentId);
          return;
        case "toggle-shortcuts":
          event.preventDefault();
          current.setShowShortcuts(!current.showShortcuts);
          return;
        default:
          return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return { searchInputRef, shortcutsPanelRef };
}
