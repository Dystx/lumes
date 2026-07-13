import { describe, expect, it } from "vitest";
import { resolveKeyboardShortcut } from "@/lib/keyboard-shortcuts";

const baseInput = {
  target: "other" as const,
  defaultPrevented: false,
  hasOpenOverlay: false,
  incidentFocusActive: false,
  hasSelectedIncident: true,
};

describe("keyboard shortcut routing", () => {
  it("protects editable fields and only blurs them on Escape", () => {
    expect(resolveKeyboardShortcut({ ...baseInput, key: "r", target: "input" })).toBeNull();
    expect(resolveKeyboardShortcut({ ...baseInput, key: "Escape", target: "textarea" })).toBe("blur-input");
    expect(resolveKeyboardShortcut({ ...baseInput, key: "?", target: "select" })).toBeNull();
    expect(resolveKeyboardShortcut({ ...baseInput, key: "r", target: "editable" })).toBeNull();
  });

  it("keeps Escape ownership ordered from overlays to incident focus", () => {
    expect(resolveKeyboardShortcut({ ...baseInput, key: "Escape", hasOpenOverlay: true })).toBe("close-overlay");
    expect(resolveKeyboardShortcut({ ...baseInput, key: "Escape", incidentFocusActive: true })).toBe("exit-incident-focus");
    expect(resolveKeyboardShortcut({ ...baseInput, key: "Escape", hasSelectedIncident: true })).toBe("close-incident");
    expect(resolveKeyboardShortcut({ ...baseInput, key: "Escape", defaultPrevented: true })).toBeNull();
  });

  it("routes action keys only when their action has enough context", () => {
    expect(resolveKeyboardShortcut({ ...baseInput, key: "/" })).toBe("focus-search");
    expect(resolveKeyboardShortcut({ ...baseInput, key: "r" })).toBe("refresh");
    expect(resolveKeyboardShortcut({ ...baseInput, key: "F" })).toBe("toggle-follow");
    expect(resolveKeyboardShortcut({ ...baseInput, key: "l" })).toBe("locate-incident");
    expect(resolveKeyboardShortcut({ ...baseInput, key: "?" })).toBe("toggle-shortcuts");
    expect(resolveKeyboardShortcut({ ...baseInput, key: "f", hasSelectedIncident: false })).toBeNull();
    expect(resolveKeyboardShortcut({ ...baseInput, key: "l", hasSelectedIncident: false })).toBeNull();
  });
});
