// IPMA Weather Warnings — official meteorological warnings for Portugal
// Source: https://api.ipma.pt/open-data/forecast/warnings/warnings_www.json
// Returns all active warnings (heat, wind, rain, thunderstorm, etc.) by region
// Cache: 10 minutes (warnings don't change frequently)

import { NextResponse } from "next/server";
import { cached } from "@/lib/api/cache";
import { classifyDataState, createDataStateMeta } from "@/lib/data-state";
import { logServerFailure } from "@/lib/observability";
import { normalizeWeatherWarnings } from "@/lib/weather/warnings";

const WARNINGS_URL =
  "https://api.ipma.pt/open-data/forecast/warnings/warnings_www.json";

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
  try {
    const data = await cached("weather-warnings", 10 * 60 * 1000, async () => {
      const res = await fetch(WARNINGS_URL, {
        headers: { "User-Agent": "lumes.pt-Platform/0.1 (wildfire-intel)" },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        throw new Error(`IPMA HTTP ${res.status}`);
      }

      const raw: unknown = await res.json();
      const normalizedWarnings = normalizeWeatherWarnings(raw);
      if (normalizedWarnings === null) {
        throw new Error("Invalid IPMA warnings payload");
      }

      // Normalize and filter to active warnings (exclude "green" = no warning)
      const warnings = normalizedWarnings
        .map((warning) => {
          const { area, type, level, startTime, endTime, text } = warning;
          return {
            id: `${area}-${type}-${startTime}`,
            area,
            areaName: AREA_NAMES[area] || area,
            type,
            text,
            level,
            startTime,
            endTime,
          };
        })
        .sort((a, b) => {
          const rank = { red: 0, orange: 1, yellow: 2 };
          return (rank[a.level as keyof typeof rank] ?? 9) -
                 (rank[b.level as keyof typeof rank] ?? 9);
        });

      const fetchedAt = new Date().toISOString();
      return {
        source: "ipma-warnings",
        fetchedAt,
        count: warnings.length,
        warnings,
        distribution: {
          red: warnings.filter((w) => w.level === "red").length,
          orange: warnings.filter((w) => w.level === "orange").length,
          yellow: warnings.filter((w) => w.level === "yellow").length,
        },
        dataState: createDataStateMeta(classifyDataState({ count: warnings.length }), undefined, fetchedAt, "ipma-warnings"),
      };
    });

    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=300" },
    });
  } catch (err: unknown) {
    logServerFailure("weather-warnings.fetch", err, { route: "/api/weather-warnings", retryable: true });
    return NextResponse.json(
      {
        error: "Weather warnings are temporarily unavailable.",
        warnings: [],
        count: 0,
        dataState: createDataStateMeta("retryable-error", "IPMA warnings source unavailable"),
      },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
