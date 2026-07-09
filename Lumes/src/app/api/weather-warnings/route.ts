// IPMA Weather Warnings — official meteorological warnings for Portugal
// Source: https://api.ipma.pt/open-data/forecast/warnings/warnings_www.json
// Returns all active warnings (heat, wind, rain, thunderstorm, etc.) by region
// Cache: 10 minutes (warnings don't change frequently)

import { NextResponse } from "next/server";
import { cached } from "@/lib/api/cache";

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
      });

      if (!res.ok) {
        throw new Error(`IPMA HTTP ${res.status}`);
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

      return {
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
    });

    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=300" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("HTTP") ? 502 : 500;
    return NextResponse.json(
      { error: msg, warnings: [], count: 0 },
      { status }
    );
  }
}
