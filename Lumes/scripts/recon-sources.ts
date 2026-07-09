// Extended source reconnaissance — probe multiple data sources in parallel
// Goals:
//   1. Discover additional layers/services on the ANEPC ArcGIS org
//   2. Confirm NASA FIRMS, IPMA, ICNF, SNIG endpoints
//   3. Probe Copernicus EFFIS for European-scale context
//   4. Catalog what's actually accessible vs. gated

import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";

const OUTPUT_DIR = "/home/z/my-project/download/source-recon";
if (!existsSync(OUTPUT_DIR)) await mkdir(OUTPUT_DIR, { recursive: true });

const HEADERS = {
  "User-Agent": "Ember-Platform-Research/0.1 (wildfire-intel; +contact@ember.pt)",
  "Accept": "application/json, application/geo+json, text/plain;q=0.5",
};

interface Probe {
  id: string;
  label: string;
  url: string;
  category: string;
  expectJson: boolean;
}

const probes: Probe[] = [
  // === 1. ANEPC ArcGIS org — discover more services and layers ===
  {
    id: "anepc-ago-org-root",
    label: "ANEPC ArcGIS Online org — root content",
    url: "https://services-eu1.arcgis.com/VlrHb7fn5ewYhX6y/arcgis/rest/services?f=json",
    category: "anepc-arcgis",
    expectJson: true,
  },
  // Probe layer 1, 2, 3 on OcorrenciasSite (layer 0 we already have)
  ...[1, 2, 3, 4].map((i) => ({
    id: `ocorrencias-layer-${i}`,
    label: `OcorrenciasSite/FeatureServer/${i}`,
    url: `https://services-eu1.arcgis.com/VlrHb7fn5ewYhX6y/arcgis/rest/services/OcorrenciasSite/FeatureServer/${i}?f=json`,
    category: "anepc-arcgis",
    expectJson: true,
  })),
  // Comandos Regionais layer 0 schema
  {
    id: "comandos-layer-0",
    label: "Comandos Regionais ANEPC/FeatureServer/0",
    url: "https://services-eu1.arcgis.com/VlrHb7fn5ewYhX6y/arcgis/rest/services/Comandos%20Regionais%20ANEPC/FeatureServer/0?f=json",
    category: "anepc-arcgis",
    expectJson: true,
  },

  // === 2. NASA FIRMS — confirm keyless access (with MAP_KEY placeholder) ===
  // The CSV endpoint requires a MAP_KEY; the metadata endpoints may not
  {
    id: "firms-metadata",
    label: "NASA FIRMS — API metadata",
    url: "https://firms.modaps.eosdis.nasa.gov/api/area/csv/MAAP_KEY/VIIRS_SNPP_NRT/-12,36,-6,44/1",
    category: "nasa-firms",
    expectJson: false,
  },

  // === 3. IPMA — open data endpoints (no key required) ===
  {
    id: "ipma-observations",
    label: "IPMA — surface weather observations",
    url: "https://api.ipma.pt/open-data/observation/meteorology/stations/observations.json",
    category: "ipma",
    expectJson: true,
  },
  {
    id: "ipma-fire-risk",
    label: "IPMA — daily fire risk index",
    url: "https://api.ipma.pt/open-data/forecast/meteorology/rcm/rcm-d0.json",
    category: "ipma",
    expectJson: true,
  },
  {
    id: "ipma-stations",
    label: "IPMA — weather station list",
    url: "https://api.ipma.pt/open-data/observation/meteorology/stations/stations.json",
    category: "ipma",
    expectJson: true,
  },
  {
    id: "ipma-root",
    label: "IPMA — open data root",
    url: "https://api.ipma.pt/open-data.json",
    category: "ipma",
    expectJson: true,
  },

  // === 4. SNIG (DGT) — search for wildfire/fire datasets ===
  {
    id: "snig-search-fire",
    label: "SNIG — search 'incêndio' datasets",
    url: "https://snig-api.epal.pt/api/v1/resources?search=incêndio&pageSize=20",
    category: "snig",
    expectJson: true,
  },
  {
    id: "snig-search-fogos",
    label: "SNIG — search 'fogos' datasets",
    url: "https://snig-api.epal.pt/api/v1/resources?search=fogos&pageSize=20",
    category: "snig",
    expectJson: true,
  },
  // ICNF burned area polygons (well-known SNIG resource)
  {
    id: "snig-icnf-burned",
    label: "SNIG — ICNF burned areas dataset",
    url: "https://snig-api.epal.pt/api/v1/resources?q=areas+ardidas&pageSize=10",
    category: "snig",
    expectJson: true,
  },

  // === 5. Copernicus EFFIS — European Forest Fire Information System ===
  {
    id: "effis-current-fires",
    label: "EFFIS — current fires GeoJSON",
    url: "https://effis.jrc.ec.europa.eu/geoserver/effis/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=effis:current_fires&outputFormat=application/json&maxFeatures=20",
    category: "copernicus",
    expectJson: true,
  },
  {
    id: "effis-fire-perimeters",
    label: "EFFIS — fire perimeters (recent)",
    url: "https://effis.jrc.ec.europa.eu/geoserver/effis/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=effis:fires&outputFormat=application/json&maxFeatures=20",
    category: "copernicus",
    expectJson: true,
  },
  // EFFIS GetCapabilities — discover all available layers
  {
    id: "effis-capabilities",
    label: "EFFIS — WFS GetCapabilities",
    url: "https://effis.jrc.ec.europa.eu/geoserver/effis/ows?service=WFS&version=1.0.0&request=GetCapabilities",
    category: "copernicus",
    expectJson: false,
  },

  // === 6. ICNF — main site and known endpoints ===
  {
    id: "icnf-geoserver-cap",
    label: "ICNF — GeoServer capabilities",
    url: "https://geoservices.icnf.pt/geoserver/ows?service=WFS&version=1.0.0&request=GetCapabilities",
    category: "icnf",
    expectJson: false,
  },

  // === 7. SEF / ANEPC Twitter fallback — less useful but worth noting ===
  // Skip — social media scraping is brittle and out of scope for now
];

// ============================================================
// Run probes in parallel batches of 6
// ============================================================
console.log("=".repeat(72));
console.log("EMBER PLATFORM — Extended Source Reconnaissance");
console.log(`Probing ${probes.length} endpoints across ${new Set(probes.map(p => p.category)).size} categories`);
console.log("=".repeat(72));

interface Result {
  probe: Probe;
  status: number | null;
  contentType: string | null;
  sizeBytes: number | null;
  durationMs: number | null;
  bodyPreview: string | null;
  error: string | null;
  jsonType: string | null; // detected JSON shape: FeatureCollection, object, array, etc.
}

async function probe(p: Probe): Promise<Result> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(p.url, { headers: HEADERS, signal: controller.signal });
    clearTimeout(t);
    const text = await res.text();
    const durationMs = Date.now() - start;
    const sizeBytes = Buffer.byteLength(text, "utf8");

    // Save raw response
    const slug = p.id;
    const ext = p.expectJson ? "json" : "txt";
    await writeFile(`${OUTPUT_DIR}/${slug}.${ext}`, text, "utf8");

    // Detect JSON shape
    let jsonType: string | null = null;
    if (text.trim().startsWith("{") || text.trim().startsWith("[")) {
      try {
        const j = JSON.parse(text);
        if (j.type === "FeatureCollection") jsonType = "FeatureCollection";
        else if (j.type === "Feature") jsonType = "Feature";
        else if (Array.isArray(j)) jsonType = `array(${j.length})`;
        else if (j.features && Array.isArray(j.features)) jsonType = `FeatureCollection(${j.features.length})`;
        else if (j.services && Array.isArray(j.services)) jsonType = `services(${j.services.length})`;
        else if (j.layers && Array.isArray(j.layers)) jsonType = `layers(${j.layers.length})`;
        else if (j.data) jsonType = `object(data)`;
        else jsonType = "object";
      } catch {
        jsonType = "json-parse-error";
      }
    }

    return {
      probe: p,
      status: res.status,
      contentType: res.headers.get("content-type"),
      sizeBytes,
      durationMs,
      bodyPreview: text.slice(0, 300).replace(/\n/g, " ").trim(),
      error: null,
      jsonType,
    };
  } catch (err: unknown) {
    const durationMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    return {
      probe: p,
      status: null,
      contentType: null,
      sizeBytes: null,
      durationMs,
      bodyPreview: null,
      error: msg,
      jsonType: null,
    };
  }
}

// Run in batches of 6
const results: Result[] = [];
const BATCH_SIZE = 6;
for (let i = 0; i < probes.length; i += BATCH_SIZE) {
  const batch = probes.slice(i, i + BATCH_SIZE);
  console.log(`\n→ Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(probes.length / BATCH_SIZE)} (${batch.length} probes)`);
  const batchResults = await Promise.all(batch.map(probe));
  results.push(...batchResults);
  for (const r of batchResults) {
    const status = r.status ?? "ERR";
    const size = r.sizeBytes ? `${(r.sizeBytes / 1024).toFixed(1)}KB` : "—";
    console.log(`  [${String(status).padEnd(4)}] ${size.padEnd(8)} ${r.probe.id.padEnd(28)} ${r.error ?? r.jsonType ?? ""}`);
  }
}

// ============================================================
// Summary report
// ============================================================
console.log("\n" + "=".repeat(72));
console.log("RECONNAISSANCE SUMMARY");
console.log("=".repeat(72));

const byCategory = new Map<string, Result[]>();
for (const r of results) {
  if (!byCategory.has(r.probe.category)) byCategory.set(r.probe.category, []);
  byCategory.get(r.probe.category)!.push(r);
}

for (const [cat, catResults] of byCategory) {
  console.log(`\n[${cat.toUpperCase()}]`);
  for (const r of catResults) {
    const status = r.status ?? "ERR";
    const size = r.sizeBytes ? `${(r.sizeBytes / 1024).toFixed(1)}KB` : "—";
    console.log(`  ${r.probe.id.padEnd(28)} ${String(status).padEnd(5)} ${size.padEnd(10)} ${r.probe.label}`);
    if (r.error) console.log(`    ✗ ${r.error}`);
    if (r.bodyPreview && (r.status === 200 || r.status === 400)) {
      console.log(`    → ${r.bodyPreview.slice(0, 180)}`);
    }
    if (r.jsonType) console.log(`    JSON: ${r.jsonType}`);
  }
}

// Save full results
await writeFile(
  `${OUTPUT_DIR}/recon-results.json`,
  JSON.stringify(results, null, 2),
  "utf8"
);
console.log(`\n✓ All artifacts saved to ${OUTPUT_DIR}/`);
