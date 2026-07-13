import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const mobileView = readFileSync(resolve(process.cwd(), "src/components/mobile/mobile-view.tsx"), "utf8");
const page = readFileSync(resolve(process.cwd(), "src/app/page.tsx"), "utf8");
const detailPanel = readFileSync(resolve(process.cwd(), "src/components/detail/IncidentDetailPanel.tsx"), "utf8");

describe("mobile notification parity", () => {
  it("exposes the page-owned unread count to the mobile navigation", () => {
    expect(page).toContain("unreadNotificationCount={unreadCount}");
    expect(mobileView).toContain("unreadNotificationCount");
    expect(mobileView).toContain('tab === "alerts"');
    expect(mobileView).toContain("notificationBadgeLabel");
  });

  it("keeps drawer copy and empty-state controls localized and truthful", () => {
    expect(detailPanel).toContain('t(lang, "notifications.title")');
    expect(detailPanel).toContain('tFmt(lang, "notifications.unreadCount"');
    expect(detailPanel).toContain('t(lang, "notifications.empty")');
    expect(detailPanel).toContain("disabled={!hasUnread}");
    expect(detailPanel).toContain('t(lang, "notifications.bypassQuiet")');
  });
});
