// NASA FIRMS satellite connector — VIIRS active fire detections.
//
// Requires FIRMS_MAP_KEY (free from NASA). Without it, returns 503
// (no stub/fallback data) per design. Client shows "synthetic" note.
//
// Get a free key: https://firms.modaps.eosdis.nasa.gov/api/area/
// Set FIRMS_MAP_KEY in `.env` and restart the service.

import { NextResponse } from "next/server";
import type { SatelliteResponse, SatelliteDetection } from "@/lib/types";
import { cached } from "@/lib/api/cache";
import { rateLimit, clientKey } from "@/lib/api/rate-limit";

const FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv";
const MAP_KEY = process.env.FIRMS_MAP_KEY ?? "";
const PORTUGAL_BBOX = "-9,36,42.2,-6";

function parseFIRMS(csv: string): SatelliteDetection[] {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  const out: SatelliteDetection[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = (values[idx] ?? "").trim(); });
    const lat = parseFloat(row.latitude);
    const lon = parseFloat(row.longitude);
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
    const frp = parseFloat(row.frp) || 0;
    const confidence = row.confidence === "high" ? 0.9 : row.confidence === "nominal" ? 0.65 : 0.35;
    out.push({
      id: `firms-${row.acq_date}-${row.acq_time}-${lat.toFixed(3)}-${lon.toFixed(3)}`,
      sourceId: "nasa-firms-viirs",
      observedAt: `${row.acq_date}T${(row.acq_time || "0000").slice(0, 2)}:${(row.acq_time || "00").slice(2, 4)}:00Z`,
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: {
        satellite: row.satellite,
        instrument: row.instrument,
        frp,
        brightness: parseFloat(row.bright_ti4) || 0,
        confidence,
      },
      severity: frp > 10 ? "high" : frp > 3 ? "medium" : "low",
      displayName: `VIIRS — ${frp.toFixed(1)} MW`,
      sourceType: "satellite",
      trust: {
        confidence,
        sourceReputation: 0.85,
        verificationStatus: "single-source",
        corroborationCount: 0,
        freshnessScore: 0.9,
      },
      eventType: "wildfire",
      incidentStatus: "active",
      estimatedAreaHa: 0,
      firstDetected: "",
      lastUpdated: "",
    });
  }
  return out;
}

export async function GET(req: Request) {
  const rl = rateLimit(clientKey(req), { limit: 60 });
  if (!rl.ok) {
    return NextResponse.json({ error: "rate limit exceeded" }, { status: 429 });
  }
  if (!MAP_KEY) {
    return NextResponse.json({ error: "FIRMS_MAP_KEY not configured", count: 0, detections: [] }, { status: 503 });
  }
  try {
    const data = await cached("satellite-firms-viirs", 15 * 60 * 1000, async () => {
      // With MAP_KEY — fetch real FIRMS data.
      const url = `${FIRMS_BASE}/${MAP_KEY}/VIIRS_SNPP_NRT/${PORTUGAL_BBOX}/2`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) {
        throw new Error(`FIRMS HTTP ${res.status}`);
      }
      const csv = await res.text();
      const detections = parseFIRMS(csv);
      const result: SatelliteResponse = {
        source: "nasa-firms-viirs",
        sourceType: "satellite",
        fetchedAt: new Date().toISOString(),
        count: detections.length,
        detections,
        bbox: PORTUGAL_BBOX,
        dayRange: 2,
      };
      return result;
    });

    return NextResponse.json(
      { ...data, cached: false },
      { headers: { "Cache-Control": "public, s-maxage=900" } }
    );
  } catch (err) {
    return NextResponse.json(
      { source: "nasa-firms-viirs", error: err instanceof Error ? err.message : "fetch failed", count: 0, detections: [] },
      { status: 502 }
    );
  }
}
