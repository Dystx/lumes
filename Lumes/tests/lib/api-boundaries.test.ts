import { beforeEach, describe, expect, it } from "vitest";
import { parseBbox } from "@/app/api/aerial/route";
import { GET as aerialGet } from "@/app/api/aerial/route";
import { GET as riskGet } from "@/app/api/risk/route";
import { POST as incidentRisksPost } from "@/app/api/incidents/risks/route";
import { GET as historyGet } from "@/app/api/history/route";
import { GET as regionGet } from "@/app/api/region/[name]/route";
import { rateLimit, resetRateLimit } from "@/lib/api/rate-limit";
import { NextRequest } from "next/server";

describe("public API input boundaries", () => {
  beforeEach(() => resetRateLimit());

  it("rejects non-finite and out-of-Portugal aerial bboxes", () => {
    expect(parseBbox("0,0,1,Infinity")).toBeNull();
    expect(parseBbox("-9.5,36.95,-6,42.15")).toEqual([-9.5, 36.95, -6, 42.15]);
    expect(parseBbox("-20,36,-6,42")).toBeNull();
    expect(parseBbox("-6,42,-9,36")).toBeNull();
  });

  it("rejects inverted or unbounded aerial altitude filters", async () => {
    const response = await aerialGet(new NextRequest("http://localhost/api/aerial?minAltitudeFt=90000&maxAltitudeFt=100"));
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects non-finite risk coordinates before upstream work", async () => {
    const response = await riskGet(new NextRequest("http://localhost/api/risk?lat=Infinity&lon=-9"));
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ error: "lat and lon must be finite Portugal coordinates" });
  });

  it("bounds batch risk fan-out before database or weather work", async () => {
    const response = await incidentRisksPost(new NextRequest("http://localhost/api/incidents/risks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ incidentIds: Array.from({ length: 51 }, (_, index) => `incident-${index}`) }),
    }));
    expect(response.status).toBe(400);
  });

  it("rejects invalid history bounds and dates", async () => {
    const negativeOffset = await historyGet(new NextRequest("http://localhost/api/history?offset=-1"));
    expect(negativeOffset.status).toBe(400);
    const invalidDate = await historyGet(new NextRequest("http://localhost/api/history?startDate=not-a-date"));
    expect(invalidDate.status).toBe(400);
  });

  it("rejects oversized region names before querying persistence", async () => {
    const response = await regionGet(
      new NextRequest("http://localhost/api/region/" + "x".repeat(81)),
      { params: Promise.resolve({ name: "x".repeat(81) }) },
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns a no-store retryable envelope when a risk caller is rate limited", async () => {
    for (let index = 0; index < 30; index += 1) rateLimit("risk-test", { limit: 30 });
    const response = await riskGet(new NextRequest("http://localhost/api/risk?lat=38.72&lon=-9.14", {
      headers: { "x-real-ip": "risk-test" },
    }));

    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ dataState: { state: "retryable-error" } });
  });
});
