import { describe, expect, it } from "vitest";
import { NOTIFICATIONS_MOCK } from "@/lib/sample-data";
import { markNotificationsRead } from "@/lib/use-notifications";

describe("notification state", () => {
  it("marks every notification read without mutating the source list", () => {
    const current = NOTIFICATIONS_MOCK.map((notification) => ({ ...notification }));
    const next = markNotificationsRead(current);

    expect(current.filter((notification) => !notification.read).length).toBeGreaterThan(0);
    expect(next.every((notification) => notification.read)).toBe(true);
    expect(next).not.toBe(current);
  });
});
