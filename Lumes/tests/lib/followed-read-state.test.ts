import { describe, expect, it } from "vitest";
import {
  getUnreadFollowedIncidents,
  markFollowedIncidentsRead,
  normalizeFollowedReadState,
  serializeFollowedReadState,
} from "@/lib/followed-read-state";

const incidents = [
  { id: "incident-a", lastUpdated: "2026-07-13T10:00:00.000Z" },
  { id: "incident-b", lastUpdated: "2026-07-13T09:00:00.000Z" },
  { id: "incident-no-time", lastUpdated: "not-a-date" },
];

describe("followed incident read state", () => {
  it("normalizes persisted timestamps and fails closed for invalid entries", () => {
    const state = normalizeFollowedReadState({
      "incident-a": "2026-07-13T09:00:00.000Z",
      "incident-invalid": "not-a-date",
      "__proto__": "2026-07-13T09:00:00.000Z",
    });

    expect([...state.entries()]).toEqual([["incident-a", "2026-07-13T09:00:00.000Z"]]);
    expect(JSON.parse(serializeFollowedReadState(state))).toEqual({
      "incident-a": "2026-07-13T09:00:00.000Z",
    });
  });

  it("counts only followed incidents updated after their local read baseline", () => {
    const readState = normalizeFollowedReadState({
      "incident-a": "2026-07-13T09:00:00.000Z",
      "incident-b": "2026-07-13T09:00:00.000Z",
    });

    expect(getUnreadFollowedIncidents(incidents, new Set(["incident-a", "incident-b", "incident-no-time"]), readState))
      .toEqual([incidents[0]]);
  });

  it("marks current followed rows seen without mutating the previous map", () => {
    const current = normalizeFollowedReadState({ "incident-b": "2026-07-13T08:00:00.000Z" });
    const next = markFollowedIncidentsRead(current, incidents);

    expect(current.get("incident-a")).toBeUndefined();
    expect(next.get("incident-a")).toBe("2026-07-13T10:00:00.000Z");
    expect(next.get("incident-b")).toBe("2026-07-13T09:00:00.000Z");
    expect(next.get("incident-no-time")).toBeUndefined();
  });

  it("does not create unread state for incidents without a valid provider timestamp", () => {
    expect(getUnreadFollowedIncidents(incidents, new Set(["incident-no-time"]), new Map())).toEqual([]);
    expect(markFollowedIncidentsRead(new Map(), [incidents[2]])).toEqual(new Map());
  });
});
