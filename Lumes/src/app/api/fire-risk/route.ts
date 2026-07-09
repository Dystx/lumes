// IPMA fire risk connector — fetches daily RCM for 278 municipalities
// 1h cache

import { NextResponse } from "next/server";
import type { FireRiskResponse, FireRiskRecord } from "@/lib/types";
import { cached } from "@/lib/api/cache";
import { rateLimit, clientKey } from "@/lib/api/rate-limit";
import { classifyDataState, createDataStateMeta } from "@/lib/data-state";
import { logServerFailure } from "@/lib/observability";

const IPMA_URL = "https://api.ipma.pt/open-data/forecast/meteorology/rcm/rcm-d0.json";

const RISK_LABELS = ["", "Reduced", "Moderate", "High", "Very High", "Maximum"];

export async function GET(req: Request) {
  const rl = rateLimit(clientKey(req), { limit: 30 });
  if (!rl.ok) {
    return NextResponse.json({ error: "rate limit exceeded" }, { status: 429 });
  }
  try {
    const result = await cached("fire-risk", 60 * 60 * 1000, async () => {
      const res = await fetch(IPMA_URL, {
        headers: { "User-Agent": "lumes.pt-Platform/0.1", Accept: "application/json" },
      });

      if (!res.ok) {
        throw new Error(`IPMA HTTP ${res.status}`);
      }

      const raw: any = await res.json();
      const localMap: Record<string, any> = raw.local || {};
      const records: FireRiskRecord[] = Object.entries(localMap).map(([dico, v]: [string, any]) => ({
        dico,
        latitude: v.latitude,
        longitude: v.longitude,
        rcm: v.data?.rcm ?? 0,
        dataPrev: raw.dataPrev,
      }));

      const distribution: Record<number, number> = {};
      for (const r of records) {
        distribution[r.rcm] = (distribution[r.rcm] || 0) + 1;
      }

      return {
        source: "ipma",
        fetchedAt: new Date().toISOString(),
        dataPrev: raw.dataPrev,
        dataRun: raw.dataRun,
        count: records.length,
        distribution,
        records,
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
