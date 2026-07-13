import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const page = readFileSync(resolve(root, "src/app/page.tsx"), "utf8");
const filters = readFileSync(resolve(root, "src/components/filters/filters-panel.tsx"), "utf8");
const situation = readFileSync(resolve(root, "src/components/shell/situation-panel.tsx"), "utf8");
const sidebar = readFileSync(resolve(root, "src/components/layout/right-sidebar.tsx"), "utf8");

describe("desktop information architecture contract", () => {
  it("keeps the desktop situation rail focused and makes Explore the query owner", () => {
    expect(page).toContain("<SituationPanel");
    expect(page).not.toMatch(/hidden xl:flex[\s\S]{0,500}<DashboardPanel/);
    expect(situation).toContain("onOpenAllIncidents");
    expect(situation).toContain("priorityIncidents.slice(0, 5)");
    expect(filters).toContain("Quick filter");
    expect(filters).toContain("activeFilters");
    expect(filters).not.toContain("Critical only");
    expect(filters.match(/Hide resolved/g)?.length ?? 0).toBe(1);
  });

  it("exposes a drawer dialog and capture-phase Escape contract", () => {
    expect(sidebar).toContain('role="dialog"');
    expect(sidebar).toContain('aria-modal="false"');
    expect(sidebar).toContain("useOverlayEscape");
    expect(sidebar).not.toContain('window.addEventListener("keydown", onKeyDown, true)');
    expect(sidebar).toContain("openerRef.current?.focus()");
    expect(sidebar).toContain("min-h-11 min-w-11");
    expect(sidebar).not.toContain("min-h-9 min-w-9");
  });

  it("keeps notification badges owned by the notification surfaces", () => {
    expect(sidebar).not.toContain("unreadCount");
    expect(sidebar).toContain("activeFilterCount");
  });
});
