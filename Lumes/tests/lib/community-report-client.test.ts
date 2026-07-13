import { afterEach, describe, expect, it, vi } from "vitest";
import {
  normalizeCommunityReportSubmitResponse,
  submitCommunityReport,
} from "@/lib/community-report-client";

const fetchedAt = "2026-07-13T10:00:00Z";

describe("community report client boundary", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts a bounded successful acknowledgement", () => {
    expect(normalizeCommunityReportSubmitResponse({
      ok: true,
      report: { id: "report-1", status: "pending_review" },
      message: "Report submitted successfully.",
      dataState: { state: "healthy", updatedAt: fetchedAt },
    }, true)).toMatchObject({
      ok: true,
      report: { id: "report-1", status: "pending_review" },
    });
  });

  it("rejects a successful response without its acknowledgement contract", () => {
    expect(normalizeCommunityReportSubmitResponse({ ok: true, report: {} }, true)).toBeNull();
    expect(normalizeCommunityReportSubmitResponse({ ok: true, report: { id: "report-1", status: "approved" }, message: "ok" }, true)).toBeNull();
  });

  it("preserves bounded failure responses without treating them as success", () => {
    expect(normalizeCommunityReportSubmitResponse({
      error: "Rate limit exceeded",
      dataState: { state: "retryable-error", updatedAt: fetchedAt },
    }, false)).toEqual({
      ok: false,
      error: "Rate limit exceeded",
      dataState: { state: "retryable-error", updatedAt: fetchedAt },
    });
  });

  it("rejects malformed failure bodies", () => {
    expect(normalizeCommunityReportSubmitResponse({ error: "" }, false)).toBeNull();
    expect(normalizeCommunityReportSubmitResponse({ ok: true, message: "accepted" }, false)).toBeNull();
  });

  it("only resolves a validated successful submission", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      report: { id: "report-2", status: "pending_review" },
      message: "Received",
      dataState: { state: "healthy", updatedAt: fetchedAt },
    }), { status: 201, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(submitCommunityReport({
      type: "smoke",
      lat: 38.72,
      lon: -9.14,
    })).resolves.toMatchObject({ ok: true, report: { id: "report-2" } });
    expect(fetchMock).toHaveBeenCalledWith("/api/reports", expect.objectContaining({ method: "POST" }));
  });
});
