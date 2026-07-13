import { describe, expect, it } from "vitest";
import { notificationBadgeLabel } from "@/lib/notification-presentation";

describe("notification badge presentation", () => {
  it("does not render a badge for zero or invalid unread counts", () => {
    expect(notificationBadgeLabel(0)).toBeNull();
    expect(notificationBadgeLabel(-1)).toBeNull();
    expect(notificationBadgeLabel(Number.NaN)).toBeNull();
    expect(notificationBadgeLabel(1.5)).toBeNull();
  });

  it("renders the exact positive unread count", () => {
    expect(notificationBadgeLabel(1)).toBe("1");
    expect(notificationBadgeLabel(24)).toBe("24");
  });
});
