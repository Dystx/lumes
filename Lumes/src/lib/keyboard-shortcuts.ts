export type KeyboardShortcutTarget = "input" | "textarea" | "select" | "editable" | "other";

export type KeyboardShortcutIntent =
  | "blur-input"
  | "close-overlay"
  | "exit-incident-focus"
  | "close-incident"
  | "focus-search"
  | "refresh"
  | "toggle-follow"
  | "locate-incident"
  | "toggle-shortcuts"
  | null;

export interface KeyboardShortcutInput {
  key: string;
  target: KeyboardShortcutTarget;
  defaultPrevented: boolean;
  hasOpenOverlay: boolean;
  incidentFocusActive: boolean;
  hasSelectedIncident: boolean;
}

/**
 * Resolves the page-level keyboard contract without touching DOM or app state.
 * Overlay ownership is intentionally represented as the first Escape intent;
 * the caller still performs the actual close operation.
 */
export function resolveKeyboardShortcut(input: KeyboardShortcutInput): KeyboardShortcutIntent {
  if (input.target === "input"
    || input.target === "textarea"
    || input.target === "select"
    || input.target === "editable") {
    return input.key === "Escape" ? "blur-input" : null;
  }

  if (input.key === "Escape") {
    if (input.defaultPrevented) return null;
    if (input.hasOpenOverlay) return "close-overlay";
    if (input.incidentFocusActive) return "exit-incident-focus";
    return input.hasSelectedIncident ? "close-incident" : null;
  }

  if (input.key === "/") return "focus-search";
  if (input.key === "r" || input.key === "R") return "refresh";
  if ((input.key === "f" || input.key === "F") && input.hasSelectedIncident) return "toggle-follow";
  if ((input.key === "l" || input.key === "L") && input.hasSelectedIncident) return "locate-incident";
  if (input.key === "?") return "toggle-shortcuts";
  return null;
}
