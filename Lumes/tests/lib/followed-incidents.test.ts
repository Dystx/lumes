import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { filterFollowedIncidents, toggleFollowedId } from "@/lib/use-followed-incidents";

const source = readFileSync(resolve(process.cwd(), "src/lib/use-followed-incidents.ts"), "utf8");
const pageSource = readFileSync(resolve(process.cwd(), "src/app/page.tsx"), "utf8");
const dashboardSource = readFileSync(resolve(process.cwd(), "src/components/dashboard/DashboardPanel.tsx"), "utf8");

describe("followed incident state", () => {
  it("toggles an incident without mutating the previous set", () => {
    const current = new Set(["incident-a"]);

    const added = toggleFollowedId(current, "incident-b");
    const removed = toggleFollowedId(current, "incident-a");

    expect([...current]).toEqual(["incident-a"]);
    expect([...added].sort()).toEqual(["incident-a", "incident-b"]);
    expect([...removed]).toEqual([]);
  });

  it("filters only currently visible incidents and ignores stale followed IDs", () => {
    const incidents = [{ id: "incident-a" }, { id: "incident-b" }, { id: "incident-c" }];
    const followed = new Set(["incident-b", "incident-stale"]);

    expect(filterFollowedIncidents(incidents, followed)).toEqual([{ id: "incident-b" }]);
    expect(incidents).toEqual([{ id: "incident-a" }, { id: "incident-b" }, { id: "incident-c" }]);
  });

  it("keeps browser-local persistence and pending ownership in the hook", () => {
    expect(source).toContain('"lumes.followed-incidents"');
    expect(source).toContain("useRef<Set<string>>");
    expect(source).toContain("followedIdsRef");
    expect(source).toContain("pendingIds");
    expect(source).toContain("FOLLOWED_READ_STATE_STORAGE_KEY");
    expect(source).toContain("markFollowedIncidentsRead");
    expect(source).toContain("baselineUpdatedAt");
    expect(source).toContain("Promise<boolean>");
    expect(source).toContain("await Promise.resolve()");
    expect(source).not.toContain("/api/follow");
    expect(source).not.toContain("toast");
  });

  it("wires the page-owned follow handler directly", () => {
    expect(pageSource).not.toContain("const toggleFollow = (id: string)");
    expect(pageSource).toContain("onToggleFollow: () => handleToggleFollow(selectedIncident.id),");
    expect(pageSource).toContain("onFollow={() => handleToggleFollow(markerMenu.incidentId)}");
    expect(pageSource).toContain("handleToggleFollow(markerMenu.incidentId);");
  });

  it("keeps the Following view local to dashboard activity", () => {
    expect(dashboardSource).toContain('"following"');
    expect(dashboardSource).toContain("filterFollowedIncidents");
    expect(dashboardSource).toContain("dashboard-following-tab");
    expect(dashboardSource).toContain("dashboard-following-mobile-toggle");
    expect(dashboardSource).toContain("dashboard-following-empty");
    expect(dashboardSource).toContain("dashboard-following-no-match");
    expect(dashboardSource).toContain('data-testid="dashboard-following-clear-filters"');
    expect(dashboardSource).toContain("onClearIncidentFilters");
    expect(dashboardSource).toContain("followedReadState");
    expect(dashboardSource).toContain("onMarkFollowingSeen");
    expect(dashboardSource).toContain("dashboard-following-unread-count");
    expect(dashboardSource).toContain("followedIncidentIds.size === 0");
    expect(dashboardSource).toContain("noFollowedMatch");
    expect(dashboardSource).toContain("activityFollowing");
    expect(pageSource).not.toContain('quickFilter === "following"');
  });
});
