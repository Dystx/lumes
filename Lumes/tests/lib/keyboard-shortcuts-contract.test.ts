import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pageSource = readFileSync(resolve(process.cwd(), "src/app/page.tsx"), "utf8");
const hookSource = readFileSync(resolve(process.cwd(), "src/lib/use-keyboard-shortcuts.ts"), "utf8");

describe("keyboard shortcut ownership", () => {
  it("keeps page action injection separate from global listener ownership", () => {
    expect(pageSource).toContain("useKeyboardShortcuts({");
    expect(pageSource).not.toContain('window.addEventListener("keydown", handler)');
    expect(hookSource).toContain("resolveKeyboardShortcut");
    expect(hookSource).toContain('window.addEventListener("keydown", handler)');
    expect(hookSource).toContain('window.addEventListener("keydown", handler, true)');
    expect(hookSource).toContain("latestRef.current");
    expect(hookSource).toContain("}, []);");
  });

  it("keeps the shared focus trap and opener restoration in the hook", () => {
    expect(hookSource).toContain("trapFocus(shortcutsPanelRef.current, event)");
    expect(hookSource).toContain("shortcutsOpenerRef.current?.focus()");
    expect(pageSource).not.toContain("shortcutsOpenerRef");
  });
});
