// IPMA fire risk connector — fetches daily RCM for 278 municipalities
// 1h cache

import { NextResponse } from "next/server";
import type { FireRiskResponse, FireRiskRecord } from "@/lib/types";

const IPMA_URL = "https://api.ipma.pt/open-data/forecast/meteorology/rcm/rcm-d0.json";

interface CacheEntry {
  data: FireRiskResponse | null;
  ts: number;
  status: "ok" | "error";
  error?: string;
}
let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const RISK_LABELS = ["", "Reduced", "Moderate", "High", "Very High", "Maximum"];

export async function GET() {
  if (cache && cache.data && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(
      { ...cache.data, cached: true, cacheAge: Math.round((Date.now() - cache.ts) / 1000) },
      { headers: { "Cache-Control": "public, s-maxage=3600" } }
    );
  }

  try {
    const res = await fetch(IPMA_URL, {
      headers: { "User-Agent": "lumes.pt-Platform/0.1", Accept: "application/json" },
    });

    if (!res.ok) {
      cache = { data: null, ts: Date.now(), status: "error", error: `IPMA HTTP ${res.status}` };
      return NextResponse.json(
        { source: "ipma", error: cache.error, fetchedAt: new Date().toISOString() },
        { status: 502 }
      );
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

    const result: FireRiskResponse = {
      source: "ipma",
      fetchedAt: new Date().toISOString(),
      dataPrev: raw.dataPrev,
      dataRun: raw.dataRun,
      count: records.length,
      distribution,
      records,
    };

    cache = { data: result, ts: Date.now(), status: "ok" };

    return NextResponse.json(
      { ...result, cached: false, riskLabels: RISK_LABELS },
      { headers: { "Cache-Control": "public, s-maxage=3600" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    cache = { data: null, ts: Date.now(), status: "error", error: msg };
    return NextResponse.json(
      { source: "ipma", error: msg, fetchedAt: new Date().toISOString() },
      { status: 500 }
    );
  }
}
