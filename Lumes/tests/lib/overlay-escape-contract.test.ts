import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const blockingPrimitives = [
  "src/components/ui/overlay-dialog.tsx",
  "src/components/ui/overlay-drawer.tsx",
  "src/components/mobile/bottom-sheet.tsx",
];

describe("blocking overlay Escape ownership", () => {
  it("leaves Escape to the shared topmost-overlay controller while retaining focus trapping", () => {
    for (const file of blockingPrimitives) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain("stopImmediatePropagation");
      expect(source).toContain("trapFocus");
    }
  });
});
