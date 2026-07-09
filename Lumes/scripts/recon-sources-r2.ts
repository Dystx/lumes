// Round 2: dig deeper on the sources that failed or need correct endpoints
// Also: capture the Comandos Regionais schema and inspect IPMA fire risk structure

import { writeFile, mkdir, readFile } from "fs/promises";
import { existsSync } from "fs";

const OUTPUT_DIR = "/home/z/my-project/download/source-recon";
if (!existsSync(OUTPUT_DIR)) await mkdir(OUTPUT_DIR, { recursive: true });

const HEADERS = {
  "User-Agent": "Ember-Platform-Research/0.1 (wildfire-intel)",
  "Accept": "application/json, application/geo+json, text/plain;q=0.5",
};

async function probe(label: string, url: string, slug: string) {
  console.log(`\n→ ${label}`);
  console.log(`  ${url.slice(0, 200)}`);
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
    clearTimeout(t);
    const text = await res.text();
    const ext = text.trim().startsWith("{") || text.trim().startsWith("[") ? "json" : "txt";
    await writeFile(`${OUTPUT_DIR}/${slug}.${ext}`, text, "utf8");
    console.log(`  HTTP ${res.status} · ${Buffer.byteLength(text)} bytes · saved as ${slug}.${ext}`);
    let json: any = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, text, json, contentType: res.headers.get("content-type") };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ✗ ${msg}`);
    return { status: 0, text: "", json: null, contentType: null };
  }
}

// ============================================================
// 1. SNIG — the correct endpoint is snig.pt (not snig-api.epal.pt)
// ============================================================
// The SNIG portal runs at snig.pt and has a search API
await probe(
  "SNIG search 'incendio' (correct host)",
  "https://snig.pt/api/v1/resources?q=incendio&pageSize=20",
  "snig-search-incendio-v2"
);

await probe(
  "SNIG search 'areas ardidas' (correct host)",
  "https://snig.pt/api/v1/resources?q=areas+ardidas&pageSize=10",
  "snig-search-ardidas-v2"
);

// Try the SNIG opendata search endpoint
await probe(
  "SNIG opendata search 'fogos rurais'",
  "https://opendata.snig.pt/api/v1/resources?q=fogos+rurais&pageSize=10",
  "snig-search-fogos-opendata"
);

// ============================================================
// 2. EFFIS — the actual endpoint structure
// ============================================================
// EFFIS geoserver root — discover available layers
await probe(
  "EFFIS GeoServer root capabilities",
  "https://effis.jrc.ec.europa.eu/geoserver/ows?service=WFS&version=2.0.0&request=GetCapabilities",
  "effis-wfs-capabilities-v2"
);

// EFFIS fires perimeters — common layer names
await probe(
  "EFFIS burnt areas (correct layer name)",
  "https://effis.jrc.ec.europa.eu/geoserver/effis/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=effis:modis_fires_polygons&outputFormat=application/json&count=20",
  "effis-modis-fires-polygons"
);

await probe(
  "EFFIS fire perimeters (alternative)",
  "https://effis.jrc.ec.europa.eu/geoserver/effis/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=effis:fires_polygons&outputFormat=application/json&count=20",
  "effis-fires-polygons-v2"
);

// ============================================================
// 3. ICNF — main site to discover what services they actually expose
// ============================================================
await probe(
  "ICNF main site",
  "https://www.icnf.pt/",
  "icnf-main"
);

// ICNFgeoportal — common variants
await probe(
  "ICNF geoportal (sig.icnf.pt)",
  "https://sig.icnf.pt/",
  "icnf-sig-portal"
);

// ICNF geoportal WMS capabilities
await probe(
  "ICNF WMS capabilities (sig.icnf.pt)",
  "https://sig.icnf.pt/arcgis/services/Mapa/Mapa_ICNF/MapServer/WMSServer?request=GetCapabilities&service=WMS",
  "icnf-wms-capabilities"
);

// ============================================================
// 4. Inspect the Comandos Regionais schema we already captured
// ============================================================
console.log("\n" + "=".repeat(72));
console.log("ANALYSIS — Comandos Regionais ANEPC layer schema");
console.log("=".repeat(72));

try {
  const comandos = JSON.parse(
    await readFile(`${OUTPUT_DIR}/comandos-layer-0.json`, "utf8")
  );
  console.log(`\nName: ${comandos.name}`);
  console.log(`Geometry: ${comandos.geometryType}`);
  console.log(`Description: ${(comandos.description || "").slice(0, 200)}`);
  console.log(`Capabilities: ${comandos.capabilities}`);
  if (comandos.fields) {
    console.log(`\nFields (${comandos.fields.length}):`);
    for (const f of comandos.fields) {
      const alias = f.alias && f.alias !== f.name ? `  (${f.alias})` : "";
      console.log(`  ${f.name.padEnd(28)} ${f.type}${alias}`);
    }
  }
} catch (e) {
  console.log("Could not read comandos-layer-0.json");
}

// ============================================================
// 5. Inspect IPMA fire risk structure
// ============================================================
console.log("\n" + "=".repeat(72));
console.log("ANALYSIS — IPMA fire risk index structure");
console.log("=".repeat(72));

try {
  const fireRisk = JSON.parse(
    await readFile(`${OUTPUT_DIR}/ipma-fire-risk.json`, "utf8")
  );
  console.log(`\nTop-level keys: ${Object.keys(fireRisk).join(", ")}`);
  console.log(`dataPrev (forecast date): ${fireRisk.dataPrev}`);
  console.log(`dataRun (model run date): ${fireRisk.dataRun}`);
  console.log(`local count: ${Object.keys(fireRisk.local || {}).length}`);

  // Sample one municipality
  const firstKey = Object.keys(fireRisk.local || {})[0];
  const firstMuni = fireRisk.local?.[firstKey];
  console.log(`\nSample municipality (${firstKey}):`);
  console.log(JSON.stringify(firstMuni, null, 2));

  // Risk level distribution
  const riskCounts: Record<number, number> = {};
  for (const k of Object.keys(fireRisk.local || {})) {
    const rcm = fireRisk.local[k]?.data?.rcm;
    if (rcm != null) riskCounts[rcm] = (riskCounts[rcm] || 0) + 1;
  }
  console.log(`\nRisk level distribution (rcm value: count):`);
  const labels = ["", "Reduced", "Moderate", "High", "Very High", "Maximum"];
  for (const [rcm, count] of Object.entries(riskCounts).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    console.log(`  ${rcm} (${labels[Number(rcm)] ?? "?"}): ${count} municipalities`);
  }
} catch (e) {
  console.log("Could not read ipma-fire-risk.json");
}

// ============================================================
// 6. Inspect IPMA stations structure
// ============================================================
console.log("\n" + "=".repeat(72));
console.log("ANALYSIS — IPMA weather stations");
console.log("=".repeat(72));

try {
  const stations = JSON.parse(
    await readFile(`${OUTPUT_DIR}/ipma-stations.json`, "utf8")
  );
  console.log(`\nTotal stations: ${stations.length}`);
  if (stations[0]) {
    console.log(`\nSample station:`);
    console.log(JSON.stringify(stations[0], null, 2));
  }
  // Mainland vs islands
  const mainland = stations.filter((s: any) => {
    const lat = s.geometry?.coordinates?.[1];
    const lon = s.geometry?.coordinates?.[0];
    return lat > 36 && lat < 43 && lon > -10 && lon < -6;
  });
  const madeira = stations.filter((s: any) => {
    const lat = s.geometry?.coordinates?.[1];
    return lat > 32 && lat < 33.5;
  });
  const azores = stations.filter((s: any) => {
    const lon = s.geometry?.coordinates?.[0];
    return lon < -25 && lon > -32;
  });
  console.log(`\nGeographic distribution:`);
  console.log(`  Mainland: ${mainland.length}`);
  console.log(`  Madeira:  ${madeira.length}`);
  console.log(`  Açores:   ${azores.length}`);
  console.log(`  Other:    ${stations.length - mainland.length - madeira.length - azores.length}`);
} catch (e) {
  console.log("Could not read ipma-stations.json");
}

// ============================================================
// 7. Inspect IPMA observations structure
// ============================================================
console.log("\n" + "=".repeat(72));
console.log("ANALYSIS — IPMA surface observations");
console.log("=".repeat(72));

try {
  const obs = JSON.parse(
    await readFile(`${OUTPUT_DIR}/ipma-observations.json`, "utf8")
  );
  const timestamps = Object.keys(obs);
  console.log(`\nTimestamps in payload: ${timestamps.length}`);
  console.log(`First timestamp: ${timestamps[0]}`);
  console.log(`Last timestamp:  ${timestamps[timestamps.length - 1]}`);

  // Sample station observation
  const firstTs = timestamps[0];
  const stationIds = Object.keys(obs[firstTs] || {});
  console.log(`\nStations reporting at ${firstTs}: ${stationIds.length}`);
  console.log(`\nSample observation (station ${stationIds[0]}):`);
  console.log(JSON.stringify(obs[firstTs]?.[stationIds[0]], null, 2));
} catch (e) {
  console.log("Could not read ipma-observations.json");
}

console.log("\n✓ Round 2 reconnaissance complete");
