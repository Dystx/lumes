import { afterEach, describe, expect, it, vi } from "vitest";
import { buildReportPayload, persistFollowChange } from "@/lib/public-actions";

describe("public action contracts", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps report form fields to the report API schema", () => {
    expect(buildReportPayload({
      reportType: "smoke",
      latitude: 38.72,
      longitude: -9.14,
      description: "Smoke near the ridge",
      reporterName: "Ana",
    })).toEqual({
      type: "smoke",
      lat: 38.72,
      lon: -9.14,
      description: "Smoke near the ridge",
      name: "Ana",
    });
  });

  it("rejects an unsuccessful follow response and preserves its error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: "Rate limit exceeded" }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    )));

    await expect(persistFollowChange("incident-1", true)).rejects.toThrow("Rate limit exceeded");
  });

  it("uses DELETE to unfollow and only resolves a successful API response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(persistFollowChange("incident-1", false)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith("/api/follow", expect.objectContaining({
      method: "DELETE",
      body: JSON.stringify({ incidentId: "incident-1" }),
    }));
  });
});
