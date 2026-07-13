import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const blockingPrimitives = [
  "src/components/ui/overlay-dialog.tsx",
  "src/components/ui/overlay-drawer.tsx",
  "src/components/mobile/bottom-sheet.tsx",
  "src/components/layout/right-sidebar.tsx",
];

describe("blocking overlay Escape ownership", () => {
  it("routes blocking primitives through the shared topmost-overlay controller", () => {
    for (const file of blockingPrimitives) {
      const source = readFileSync(file, "utf8");
      expect(source).toMatch(/use(?:BlockingOverlay|OverlayEscape)/);
      expect(source).not.toContain("stopImmediatePropagation");
      expect(source).not.toContain('event.key === "Escape"');
    }
  });

  it("gives drawers and dialogs an immediate focus target before the frame fallback", () => {
    const drawerSource = readFileSync("src/components/ui/overlay-drawer.tsx", "utf8");
    const dialogSource = readFileSync("src/components/ui/overlay-dialog.tsx", "utf8");

    expect(drawerSource).toContain("drawerRef.current?.focus();");
    expect(drawerSource).toContain("requestAnimationFrame(() => drawerRef.current?.focus())");
    expect(dialogSource).toContain("panelRef.current?.focus();");
    expect(dialogSource).toContain("requestAnimationFrame(() => panelRef.current?.focus())");
  });
});
