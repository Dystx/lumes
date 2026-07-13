import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("history modal data ownership", () => {
  it("uses the shared typed history hook instead of an unbounded raw fetch", () => {
    const source = readFileSync("src/components/history/history-modal.tsx", "utf8");

    expect(source).toContain("useHistoryNew(");
    expect(source).toContain("sharedHistory");
    expect(source).toContain("DataTrustIndicator");
    expect(source).toContain("history.emptyTitle");
    expect(source).toContain("history.emptyDescription");
    expect(source).toContain('variant="no-results"');
    expect(source).toContain("history.refetch");
    expect(source).toContain("<SectionError compact");
    expect(source).not.toContain('fetch(`/api/history?');
    expect(source).not.toContain("limit: \"500\"");
  });
});

describe("historical incident selection ownership", () => {
  it("keeps history selection in the page owner and adapts it for the detail panel", () => {
    const page = readFileSync("src/app/page.tsx", "utf8");
    const dashboard = readFileSync("src/components/dashboard/DashboardPanel.tsx", "utf8");
    const detail = readFileSync("src/components/detail/IncidentDetailPanel.tsx", "utf8");
    const priorityList = dashboard.slice(
      dashboard.indexOf("{topIncidents.map"),
      dashboard.indexOf("{recentHistory.slice"),
    );
    const historyList = dashboard.slice(dashboard.indexOf("{recentHistory.slice"));

    expect(page).toContain("const [selectedHistoryIncident, setSelectedHistoryIncident]");
    expect(page).toContain("const history = useHistoryNew(undefined, true)");
    expect(page).toContain("sharedHistory={history}");
    expect(page).toContain("adaptHistoryToIncident(selectedHistoryIncident)");
    expect(page).toContain("onSelectIncident={(incident) => {");
    expect(page).toContain("setSelectedHistoryIncident(incident);");
    expect(priorityList).toContain("onClick={() => onSelectIncident(inc.id)}");
    expect(priorityList).not.toContain("onSelectHistoryIncident");
    expect(historyList).toContain("if (onSelectHistoryIncident)");
    expect(historyList).toContain("onSelectHistoryIncident(inc);");
    expect(detail).toContain("incident.properties?.riskAvailable !== false");
    expect(detail).toContain('t(lang, "incident.sourceHistory")');
    expect(detail).toContain("incident.isLive !== false");
    expect(page).toContain("if (!incident || incident.isLive === false) return;");
    expect(page).toContain("toggleFollowPersisted(id, incident.lastUpdated)");
  });
});
