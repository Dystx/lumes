// IPMA Weather Warnings — official meteorological warnings for Portugal
// Source: https://api.ipma.pt/open-data/forecast/warnings/warnings_www.json
// Returns all active warnings (heat, wind, rain, thunderstorm, etc.) by region
// Cache: 10 minutes (warnings don't change frequently)

import { NextResponse } from "next/server";

const WARNINGS_URL =
  "https://api.ipma.pt/open-data/forecast/warnings/warnings_www.json";

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min
let cache: { data: any; ts: number } | null = null;

// IPMA area codes → readable names
const AREA_NAMES: Record<string, string> = {
  ACE: "Castelo Branco", AOC: "Portalegre", AOR: "Évora",
  AVR: "Aveiro", BGC: "Bragança", BJA: "Beja", BRG: "Braga",
  CBO: "Coimbra", CBR: "Castelo Branco", EVR: "Évora",
  FAR: "Faro", GUR: "Guarda", LEI: "Leiria", LSB: "Lisboa",
  PTG: "Porto", STM: "Setúbal", VCT: "Viana do Castelo",
  VRL: "Vila Real", VSE: "Viseu",
  MTC: "Madeira (Costa Norte)", MTN: "Madeira (Costa Sul)",
  MTS: "Madeira (Serra)", MTX: "Madeira (Porto Santo)",
  AZC: "Açores (Grupo Central)", AZO: "Açores (Grupo Ocidental)",
  AZL: "Açores (Grupo Oriental)",
};

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(
      { ...cache.data, cached: true },
      { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=300" } }
    );
  }

  try {
    const res = await fetch(WARNINGS_URL, {
      headers: { "User-Agent": "lumes.pt-Platform/0.1 (wildfire-intel)" },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `IPMA HTTP ${res.status}`, warnings: [] },
        { status: 502 }
      );
    }

    const raw: any[] = await res.json();

    // Normalize and filter to active warnings (exclude "green" = no warning)
    const warnings = raw
      .filter((w) => w.awarenessLevelID && w.awarenessLevelID !== "green")
      .map((w) => ({
        id: `${w.idAreaAviso}-${w.awarenessTypeName}-${w.startTime}`,
        area: w.idAreaAviso,
        areaName: AREA_NAMES[w.idAreaAviso] || w.idAreaAviso,
        type: w.awarenessTypeName,
        text: w.text,
        level: w.awarenessLevelID, // yellow, orange, red
        startTime: w.startTime,
        endTime: w.endTime,
      }))
      .sort((a, b) => {
        const rank = { red: 0, orange: 1, yellow: 2 };
        return (rank[a.level as keyof typeof rank] ?? 9) -
               (rank[b.level as keyof typeof rank] ?? 9);
      });

    const data = {
      source: "ipma-warnings",
      fetchedAt: new Date().toISOString(),
      count: warnings.length,
      warnings,
      distribution: {
        red: warnings.filter((w) => w.level === "red").length,
        orange: warnings.filter((w) => w.level === "orange").length,
        yellow: warnings.filter((w) => w.level === "yellow").length,
      },
    };

    cache = { data, ts: Date.now() };
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=300" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: msg, warnings: [], count: 0 },
      { status: 500 }
    );
  }
}
