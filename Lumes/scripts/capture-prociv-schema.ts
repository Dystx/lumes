// Capture the real Prociv ArcGIS Online endpoints
// Hosted on services-eu1.arcgis.com / org VlrHb7fn5ewYhX6y
// Services discovered:
//   - OcorrenciasSite/FeatureServer  (the incidents)
//   - Comandos Regionais ANEPC/FeatureServer  (regional command boundaries)

import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";

const OUTPUT_DIR = "/home/z/my-project/download/prociv-capture";
if (!existsSync(OUTPUT_DIR)) await mkdir(OUTPUT_DIR, { recursive: true });

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; Ember-Platform-Research/0.1)",
  "Accept": "application/json",
  "Referer": "https://experience.arcgis.com/",
};

async function get(label: string, url: string): Promise<{ status: number; json: any | null; body: string }> {
  console.log(`\n→ ${label}`);
  console.log(`  ${url.slice(0, 180)}${url.length > 180 ? "…" : ""}`);
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
    clearTimeout(t);
    const text = await res.text();
    let json: any | null = null;
    try { json = JSON.parse(text); } catch {}
    const slug = label.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    await writeFile(`${OUTPUT_DIR}/${slug}.json`, text, "utf8");
    console.log(`  HTTP ${res.status} · ${Buffer.byteLength(text)} bytes · saved`);
    return { status: res.status, json, body: text };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ✗ ${msg}`);
    return { status: 0, json: null, body: "" };
  }
}

// ============================================================
// Step 1: Service metadata — discovers layer list + fields
// ============================================================
const SVC_BASE = "https://services-eu1.arcgis.com/VlrHb7fn5ewYhX6y/arcgis/rest/services";

const ocorrenciasSvc = await get(
  "ocorrencias-service",
  `${SVC_BASE}/OcorrenciasSite/FeatureServer?f=json`
);

const comandosSvc = await get(
  "comandos-regionais-service",
  `${SVC_BASE}/Comandos%20Regionais%20ANEPC/FeatureServer?f=json`
);

// ============================================================
// Step 2: Per-layer metadata (fields, geometry type, etc.)
// ============================================================
let ocorrenciasLayer: any = null;
if (ocorrenciasSvc.json?.layers?.length) {
  for (const layer of ocorrenciasSvc.json.layers) {
    const layerMeta = await get(
      `ocorrencias-layer-${layer.id}`,
      `${SVC_BASE}/OcorrenciasSite/FeatureServer/${layer.id}?f=json`
    );
    if (layerMeta.json) ocorrenciasLayer = layerMeta.json;
  }
}

// ============================================================
// Step 3: Live query — get actual current occurrences
// ============================================================
const queryParams = new URLSearchParams({
  f: "geojson",
  where: "1=1",
  outFields: "*",
  returnGeometry: "true",
  resultRecordCount: "100",
});

const liveQuery = await get(
  "ocorrencias-live-query",
  `${SVC_BASE}/OcorrenciasSite/FeatureServer/0/query?${queryParams.toString()}`
);

// ============================================================
// Step 4: Print schema analysis
// ============================================================
console.log("\n" + "=".repeat(72));
console.log("SCHEMA ANALYSIS — OcorrenciasSite FeatureServer");
console.log("=".repeat(72));

if (ocorrenciasLayer) {
  console.log(`\nService name:    ${ocorrenciasLayer.name ?? "—"}`);
  console.log(`Geometry type:   ${ocorrenciasLayer.geometryType ?? "—"}`);
  console.log(`Spatial ref:     ${ocorrenciasLayer.spatialReference?.wkid ?? "?"} (${ocorrenciasLayer.spatialReference?.latestWkid ?? "?"})`);
  console.log(`Capabilities:    ${ocorrenciasLayer.capabilities ?? "—"}`);
  console.log(`Description:     ${(ocorrenciasLayer.description ?? "—").slice(0, 200)}`);

  if (ocorrenciasLayer.fields) {
    console.log(`\nFields (${ocorrenciasLayer.fields.length}):`);
    for (const f of ocorrenciasLayer.fields) {
      const alias = f.alias && f.alias !== f.name ? `  (${f.alias})` : "";
      const length = f.length ? `[${f.length}]` : "";
      console.log(`  ${f.name.padEnd(28)} ${f.type.padEnd(20)}${length}${alias}`);
    }
  }

  // Look for coded value domains (the integer→text translations the user mentioned)
  if (ocorrenciasLayer.fields) {
    console.log(`\nCoded value domains (integer→text translations):`);
    let domainCount = 0;
    for (const f of ocorrenciasLayer.fields) {
      if (f.domain?.codedValues?.length) {
        domainCount++;
        console.log(`\n  ${f.name}:`);
        for (const cv of f.domain.codedValues) {
          console.log(`    ${String(cv.code).padEnd(6)} → ${cv.name}`);
        }
      }
    }
    if (domainCount === 0) console.log("  (none found in this layer)");
  }
}

// ============================================================
// Step 5: Live data preview
// ============================================================
console.log("\n" + "=".repeat(72));
console.log("LIVE DATA — First 5 occurrences currently in the system");
console.log("=".repeat(72));

if (liveQuery.json?.features?.length) {
  const features = liveQuery.json.features;
  console.log(`\nTotal features returned: ${features.length}`);
  console.log(`Geometry type: ${liveQuery.json.type}`);
  console.log(`CRS: ${JSON.stringify(liveQuery.json.crs)}`);

  console.log(`\nFeature 1 (full):`);
  console.log(JSON.stringify(features[0], null, 2));

  if (features.length > 1) {
    console.log(`\nFeature 2 (properties only):`);
    console.log(JSON.stringify(features[1].properties, null, 2));
  }

  if (features.length > 2) {
    console.log(`\nFeature 3 (properties only):`);
    console.log(JSON.stringify(features[2].properties, null, 2));
  }
} else {
  console.log(`\nNo features returned. Raw body (first 500 chars):`);
  console.log(liveQuery.body.slice(0, 500));
}

console.log("\n✓ All artifacts saved to " + OUTPUT_DIR);
