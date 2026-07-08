// NASA FIRMS satellite connector — VIIRS active fire detections.
//
// NASA provides the data free via a MAP_KEY. Without one, the endpoint
// is enabled in "stub" mode: it returns a small curated set of FIRMS
// detections (sample data) so the map layer / status panel still shows
// a meaningful response and the user can see the satellite layer shape.
//
// Get a free key: https://firms.modaps.eosdis.nasa.gov/api/area/
// Set FIRMS_MAP_KEY in `.env` and restart the service. The stub is
// replaced automatically once the key is configured.

import { NextResponse } from "next/server";
import type { SatelliteResponse, SatelliteDetection } from "@/lib/types";

const FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv";
const MAP_KEY = process.env.FIRMS_MAP_KEY ?? "";
const PORTUGAL_BBOX = "-9,36,42.2,-6";
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 min

// Sample detections — used when MAP_KEY is missing. Roughly representative
// of the VIIRS-detected hot spots Portugal would see during a high-fire
// week. Not real data; clearly labelled in the response.
const SAMPLE_DETECTIONS: SatelliteDetection[] = [
  { id: "sample-1", sourceId: "nasa-firms-viirs", sourceInternalId: "stub-1", observedAt: "2026-07-05T14:32:00Z", geometry: { type: "Point", coordinates: [-7.93, 39.55] }, properties: { satellite: "Suomi NPP", instrument: "VIIRS", frp: 18.4, brightness: 327.5, confidence: 0.85 }, severity: "high", displayName: "VIIRS — 18.4 MW", sourceType: "satellite", trust: { confidence: 0.85, sourceReputation: 0.85, verificationStatus: "single-source", corroborationCount: 0, freshnessScore: 0.9 }, eventType: "wildfire", incidentStatus: "active", estimatedAreaHa: 0, firstDetected: "2026-07-05T14:32:00Z", lastUpdated: "2026-07-05T14:32:00Z" },
  { id: "sample-2", sourceId: "nasa-firms-viirs", sourceInternalId: "stub-2", observedAt: "2026-07-05T15:18:00Z", geometry: { type: "Point", coordinates: [-8.21, 40.21] }, properties: { satellite: "NOAA-20", instrument: "VIIRS", frp: 6.1, brightness: 314.2, confidence: 0.7 }, severity: "medium", displayName: "VIIRS — 6.1 MW", sourceType: "satellite", trust: { confidence: 0.7, sourceReputation: 0.85, verificationStatus: "single-source", corroborationCount: 0, freshnessScore: 0.8 }, eventType: "wildfire", incidentStatus: "active", estimatedAreaHa: 0, firstDetected: "2026-07-05T15:18:00Z", lastUpdated: "2026-07-05T15:18:00Z" },
  { id: "sample-3", sourceId: "nasa-firms-viirs", sourceInternalId: "stub-3", observedAt: "2026-07-05T16:01:00Z", geometry: { type: "Point", coordinates: [-7.49, 40.83] }, properties: { satellite: "Suomi NPP", instrument: "VIIRS", frp: 4.2, brightness: 308.9, confidence: 0.65 }, severity: "low", displayName: "VIIRS — 4.2 MW", sourceType: "satellite", trust: { confidence: 0.65, sourceReputation: 0.85, verificationStatus: "single-source", corroborationCount: 0, freshnessScore: 0.75 }, eventType: "wildfire", incidentStatus: "active", estimatedAreaHa: 0, firstDetected: "2026-07-05T16:01:00Z", lastUpdated: "2026-07-05T16:01:00Z" },
];

interface CacheEntry { data: SatelliteResponse; ts: number }
let cache: CacheEntry | null = null

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
      sourceInternalId: row.acq_date + row.acq_time + lat + lon,
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

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(
      { ...cache.data, cached: true, cacheAge: Math.round((Date.now() - cache.ts) / 1000) },
      { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800" } }
    );
  }

  // No MAP_KEY — return the curated sample so the map layer still renders.
  if (!MAP_KEY) {
    const result: SatelliteResponse = {
      source: "nasa-firms-viirs-stub",
      sourceType: "satellite",
      fetchedAt: new Date().toISOString(),
      count: SAMPLE_DETECTIONS.length,
      detections: SAMPLE_DETECTIONS,
      bbox: PORTUGAL_BBOX,
      dayRange: 2,
    };
    cache = { data: result, ts: Date.now() };
    return NextResponse.json(
      { ...result, cached: false, note: "FIRMS_MAP_KEY not configured — serving sample data. Set the env var to enable live NASA FIRMS data." },
      { headers: { "Cache-Control": "public, s-maxage=900" } }
    );
  }

  // With MAP_KEY — fetch real FIRMS data.
  const url = `${FIRMS_BASE}/${MAP_KEY}/VIIRS_SNPP_NRT/${PORTUGAL_BBOX}/2`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      return NextResponse.json(
        { source: "nasa-firms-viirs", error: `FIRMS HTTP ${res.status}`, count: 0, detections: [] },
        { status: 502 }
      );
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
    cache = { data: result, ts: Date.now() };
    return NextResponse.json(
      { ...result, cached: false },
      { headers: { "Cache-Control": "public, s-maxage=900" } }
    );
  } catch (err) {
    return NextResponse.json(
      { source: "nasa-firms-viirs", error: err instanceof Error ? err.message : "fetch failed", count: 0, detections: [] },
      { status: 502 }
    );
  }
}
