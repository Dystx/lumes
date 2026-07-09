import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetRateLimit } from "@/lib/api/rate-limit";

const { db } = vi.hoisted(() => ({ db: {
  communityReport: {
    create: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  followedIncident: {
    findMany: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
  },
} }));

vi.mock("@/lib/db", () => ({ db }));

import { PATCH as patchReport, POST as postReport } from "@/app/api/reports/route";
import { DELETE as deleteFollow, POST as postFollow } from "@/app/api/follow/route";

describe("public action route contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimit();
  });

  it("accepts the report form contract and returns a healthy created response", async () => {
    db.communityReport.create.mockResolvedValue({ id: "report-1", reportType: "smoke" });
    const request = new NextRequest("http://localhost/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ type: "smoke", lat: 38.72, lon: -9.14, name: "Ana" }),
    });

    const response = await postReport(request);
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ ok: true, dataState: { state: "healthy" } });
    expect(db.communityReport.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ reportType: "smoke", latitude: 38.72, longitude: -9.14, reporterName: "Ana" }),
    }));
  });

  it("rejects a malformed report before touching persistence", async () => {
    const request = new NextRequest("http://localhost/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ reportType: "smoke" }),
    });

    const response = await postReport(request);
    expect(response.status).toBe(400);
    expect(db.communityReport.create).not.toHaveBeenCalled();
  });

  it("does not expose report moderation through the public API", async () => {
    const request = new NextRequest("http://localhost/api/reports", {
      method: "PATCH",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ id: "report-1", status: "verified", reviewedBy: "spoofed" }),
    });

    const response = await patchReport(request);
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, POST");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(db.communityReport.update).not.toHaveBeenCalled();
  });

  it("rejects cross-origin unfollow requests", async () => {
    const request = new NextRequest("https://lumes.pt/api/follow", {
      method: "DELETE",
      headers: { "content-type": "application/json", origin: "https://attacker.invalid" },
      body: JSON.stringify({ incidentId: "incident-1" }),
    });

    const response = await deleteFollow(request);
    expect(response.status).toBe(403);
    expect(db.followedIncident.delete).not.toHaveBeenCalled();
  });

  it("fails closed instead of mutating a global follow list", async () => {
    const request = new NextRequest("http://localhost/api/follow", {
      method: "DELETE",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ incidentId: "incident-1" }),
    });

    const response = await deleteFollow(request);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ dataState: { state: "retryable-error" } });
    expect(db.followedIncident.delete).not.toHaveBeenCalled();
  });

  it("fails closed instead of creating a global follow", async () => {
    const request = new NextRequest("http://localhost/api/follow", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ incidentId: "incident-1" }),
    });

    const response = await postFollow(request);
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ dataState: { state: "retryable-error" } });
    expect(db.followedIncident.upsert).not.toHaveBeenCalled();
  });
});
