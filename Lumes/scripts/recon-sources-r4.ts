// Round 4: EFFIS new API (api2.effis.emergency.copernicus.eu)
// + Fogos.pt network trace + GFW retry with different cert handling
import { writeFile, mkdir, readFile } from "fs/promises";
import { existsSync } from "fs";

const OUTPUT_DIR = "/home/z/my-project/download/source-recon";
if (!existsSync(OUTPUT_DIR)) await mkdir(OUTPUT_DIR, { recursive: true });

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; Ember-Platform-Research/0.1)",
  "Accept": "application/json, application/geo+json",
  "Origin": "https://forest-fire.emergency.copernicus.eu",
  "Referer": "https://forest-fire.emergency.copernicus.eu/",
};

async function probe(label: string, url: string, slug: string) {
  console.log(`\n→ ${label}\n  ${url.slice(0, 200)}`);
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
    clearTimeout(t);
    const text = await res.text();
    const ext = text.trim().startsWith("{") || text.trim().startsWith("[") ? "json" : "txt";
    await writeFile(`${OUTPUT_DIR}/${slug}.${ext}`, text, "utf8");
    console.log(`  [${res.status}] ${Buffer.byteLength(text)} bytes · ${slug}.${ext}`);
    let json: any = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, text, json };
  } catch (err: unknown) {
    console.log(`  ✗ ${err instanceof Error ? err.message : String(err)}`);
    return { status: 0, text: "", json: null };
  }
}

// ============================================================
// 1. EFFIS new API — discover endpoints
// ============================================================
console.log("=".repeat(72));
console.log("EFFIS new API (api2.effis.emergency.copernicus.eu)");
console.log("=".repeat(72));

await probe("EFFIS API root", "https://api2.effis.emergency.copernicus.eu/", "effis-api2-root");
await probe("EFFIS rda-stats", "https://api2.effis.emergency.copernicus.eu/rda-stats", "effis-api2-rda-stats");
await probe("EFFIS fires", "https://api2.effis.emergency.copernicus.eu/fires", "effis-api2-fires");
await probe("EFFIS fires (bbox Portugal)", "https://api2.effis.emergency.copernicus.eu/fires?bbox=-12,36,-6,44", "effis-api2-fires-bbox");
await probe("EFFIS active-fires", "https://api2.effis.emergency.copernicus.eu/active-fires", "effis-api2-active-fires");
await probe("EFFIS burnt-areas", "https://api2.effis.emergency.copernicus.eu/burnt-areas", "effis-api2-burnt-areas");
await probe("EFFIS countries", "https://api2.effis.emergency.copernicus.eu/countries", "effis-api2-countries");
await probe("EFFIS fire-risk", "https://api2.effis.emergency.copernicus.eu/fire-risk", "effis-api2-fire-risk");
await probe("EFFIS fire-season", "https://api2.effis.emergency.copernicus.eu/fire-season", "effis-api2-fire-season");
await probe("EFFIS statistics", "https://api2.effis.emergency.copernicus.eu/statistics", "effis-api2-statistics");

// OpenAPI / Swagger endpoints (common patterns)
await probe("EFFIS OpenAPI spec", "https://api2.effis.emergency.copernicus.eu/openapi.json", "effis-api2-openapi");
await probe("EFFIS Swagger spec", "https://api2.effis.emergency.copernicus.eu/swagger.json", "effis-api2-swagger");
await probe("EFFIS API v1", "https://api2.effis.emergency.copernicus.eu/v1/", "effis-api2-v1");
await probe("EFFIS API v2", "https://api2.effis.emergency.copernicus.eu/v2/", "effis-api2-v2");

// ============================================================
// 2. EFFIS old GeoServer — try via the new domain
// ============================================================
console.log("\n" + "=".repeat(72));
console.log("EFFIS GeoServer (new domain)");
console.log("=".repeat(72));

await probe(
  "EFFIS GeoServer root (new)",
  "https://forest-fire.emergency.copernicus.eu/geoserver/web/",
  "effis-geoserver-new"
);
await probe(
  "EFFIS GeoServer capabilities (new)",
  "https://forest-fire.emergency.copernicus.eu/geoserver/ows?service=WFS&version=2.0.0&request=GetCapabilities",
  "effis-wfs-capabilities-new"
);

// ============================================================
// 3. Inspect rda-stats to understand the API shape
// ============================================================
console.log("\n" + "=".repeat(72));
console.log("ANALYSIS — EFFIS rda-stats response shape");
console.log("=".repeat(72));

try {
  const rda = JSON.parse(await readFile(`${OUTPUT_DIR}/effis-api2-rda-stats.json`, "utf8"));
  if (Array.isArray(rda)) {
    console.log(`Array of ${rda.length} items`);
    if (rda[0]) console.log(`First item:`, JSON.stringify(rda[0], null, 2).slice(0, 600));
  } else {
    console.log(`Object keys: ${Object.keys(rda).join(", ")}`);
    console.log(JSON.stringify(rda, null, 2).slice(0, 1000));
  }
} catch (e) {
  console.log("Could not parse rda-stats response");
}

// ============================================================
// 4. Inspect Overpass fire stations
// ============================================================
console.log("\n" + "=".repeat(72));
console.log("ANALYSIS — OSM fire stations in Portugal");
console.log("=".repeat(72));

try {
  const osm = JSON.parse(await readFile(`${OUTPUT_DIR}/osm-fire-stations.json`, "utf8"));
  console.log(`OSM response: ${osm.elements?.length ?? 0} elements`);
  if (osm.elements?.[0]) {
    console.log(`\nSample fire station:`);
    console.log(JSON.stringify(osm.elements[0], null, 2));
  }
  // Count tags
  const tagCounts: Record<string, number> = {};
  for (const el of osm.elements || []) {
    for (const k of Object.keys(el.tags || {})) {
      tagCounts[k] = (tagCounts[k] || 0) + 1;
    }
  }
  console.log(`\nTag frequency (top 15):`);
  for (const [k, v] of Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`  ${k.padEnd(28)} ${v}`);
  }
} catch (e) {
  console.log("Could not parse OSM fire stations response");
}

// ============================================================
// 5. Try Fogos.pt via direct HTTP — see if their landing page is reachable
// ============================================================
console.log("\n" + "=".repeat(72));
console.log("FOGOS.PT — landing page probe");
console.log("=".repeat(72));

await probe("Fogos.pt landing", "https://fogos.pt/", "fogospt-landing");
await probe("Fogos.pt API v1", "https://fogos.pt/api/v1/", "fogospt-api-v1");
await probe("Fogos.pt API now", "https://fogos.pt/api/v1/now", "fogospt-api-now");
await probe("Fogos.online landing", "https://fogos.online/", "fogosonline-landing");

console.log("\n✓ Round 4 reconnaissance complete");
