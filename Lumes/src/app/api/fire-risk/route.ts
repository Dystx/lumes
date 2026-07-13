// IPMA fire risk connector — fetches daily RCM for 278 municipalities
// 1h cache

import { NextResponse } from "next/server";
import type { FireRiskResponse } from "@/lib/types";
import { cached } from "@/lib/api/cache";
import { rateLimit, clientKey } from "@/lib/api/rate-limit";
import { classifyDataState, createDataStateMeta } from "@/lib/data-state";
import { logServerFailure } from "@/lib/observability";
import { normalizeFireRiskPayload } from "@/lib/fire-risk/normalizer";

const IPMA_URL = "https://api.ipma.pt/open-data/forecast/meteorology/rcm/rcm-d0.json";

const RISK_LABELS = ["", "Reduced", "Moderate", "High", "Very High", "Maximum"];

export async function GET(req: Request) {
  const rl = rateLimit(clientKey(req), { limit: 30 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate limit exceeded", dataState: createDataStateMeta("retryable-error", "Rate limit exceeded") },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter), "Cache-Control": "no-store" } },
    );
  }
  try {
    const result = await cached("fire-risk", 60 * 60 * 1000, async () => {
      const res = await fetch(IPMA_URL, {
        headers: { "User-Agent": "lumes.pt-Platform/0.1", Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        throw new Error(`IPMA HTTP ${res.status}`);
      }

      const raw: unknown = await res.json();
      const normalized = normalizeFireRiskPayload(raw);

      return {
        source: "ipma",
        fetchedAt: new Date().toISOString(),
        ...normalized,
      } as FireRiskResponse;
    });

    return NextResponse.json(
      {
        ...result,
        cached: false,
        riskLabels: RISK_LABELS,
        dataState: createDataStateMeta(classifyDataState({ count: result.count }), undefined, result.fetchedAt, result.source),
      },
      { headers: { "Cache-Control": "public, s-maxage=3600" } }
    );
  } catch (err: unknown) {
    logServerFailure("fire-risk.fetch", err, { route: "/api/fire-risk", retryable: true });
    return NextResponse.json(
      {
        source: "ipma",
        count: 0,
        records: [],
        error: "Fire-risk data is temporarily unavailable.",
        dataState: createDataStateMeta("retryable-error", "IPMA fire-risk source unavailable"),
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
