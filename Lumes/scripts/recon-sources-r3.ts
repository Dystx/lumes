// Round 3: dados.gov.pt CKAN search + EFFIS deeper probe + Fogos.pt network trace
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";

const OUTPUT_DIR = "/home/z/my-project/download/source-recon";
if (!existsSync(OUTPUT_DIR)) await mkdir(OUTPUT_DIR, { recursive: true });

const HEADERS = {
  "User-Agent": "Ember-Platform-Research/0.1",
  "Accept": "application/json",
};

async function probe(label: string, url: string, slug: string) {
  console.log(`\n→ ${label}\n  ${url.slice(0, 180)}`);
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 12000);
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
// 1. dados.gov.pt (CKAN) — search for fire/wildfire datasets
// ============================================================
const queries = [
  "incendio",
  "fogos",
  "incendios rurais",
  "areas ardidas",
  "floresta",
  "combustivel",
];

console.log("=".repeat(72));
console.log("DADOS.GOV.PT — CKAN dataset search");
console.log("=".repeat(72));

const allDatasets: any[] = [];
for (const q of queries) {
  const slug = `dadosgov-${q.replace(/\s+/g, "-")}`;
  const r = await probe(
    `Search: "${q}"`,
    `https://dados.gov.pt/api/1/datasets/?q=${encodeURIComponent(q)}&page_size=20`,
    slug
  );
  if (r.json?.data) {
    console.log(`  → ${r.json.data.length} datasets found`);
    for (const ds of r.json.data) {
      allDatasets.push({ query: q, ...ds });
    }
  }
}

// Deduplicate
const byId = new Map<string, any>();
for (const ds of allDatasets) {
  if (ds.id) byId.set(ds.id, ds);
}
console.log(`\n${allDatasets.length} total hits, ${byId.size} unique datasets`);

// Show top relevant ones
console.log("\nMost relevant datasets:");
const relevantKeywords = ["incendio", "fogo", "ardid", "floresta", "fogos", "combustivel", "rural"];
const relevant = Array.from(byId.values()).filter((ds) => {
  const text = `${ds.title || ""} ${ds.description || ""} ${ds.acronym || ""}`.toLowerCase();
  return relevantKeywords.some(k => text.includes(k));
});
for (const ds of relevant.slice(0, 25)) {
  console.log(`  • ${(ds.title || "(no title)").slice(0, 80)}`);
  console.log(`    slug: ${ds.slug}`);
  console.log(`    org:  ${ds.organization?.name ?? "—"}`);
}

// Save the deduplicated list
await writeFile(
  `${OUTPUT_DIR}/dadosgov-relevant-datasets.json`,
  JSON.stringify(relevant, null, 2),
  "utf8"
);

// ============================================================
// 2. EFFIS — try the actual app URL instead of guessed WFS paths
// ============================================================
console.log("\n" + "=".repeat(72));
console.log("EFFIS — direct app probe");
console.log("=".repeat(72));

// The EFFIS portal itself
await probe(
  "EFFIS portal homepage",
  "https://effis.jrc.ec.europa.eu/",
  "effis-home"
);

// EFFIS GeoServer web admin (often exposes layer list)
await probe(
  "EFFIS GeoServer landing",
  "https://effis.jrc.ec.europa.eu/geoserver/web/",
  "effis-geoserver-web"
);

// Try common EFFIS layer names
const effisLayers = [
  "effis:fires",
  "effis:fire_perimeters",
  "effis:burnt_areas",
  "effis:modis_burnt_areas",
  "effis:current_situations",
  "effis:fires_potentially_affected",
];
for (const layer of effisLayers) {
  await probe(
    `EFFIS WFS layer: ${layer}`,
    `https://effis.jrc.ec.europa.eu/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=${layer}&outputFormat=application/json&count=5`,
    `effis-${layer.replace(/[^a-z0-9]/gi, "-")}`
  );
}

// ============================================================
// 3. Global Forest Watch Fires API — well-documented, open
// ============================================================
console.log("\n" + "=".repeat(72));
console.log("Global Forest Watch Fires API");
console.log("=".repeat(72));

await probe(
  "GFW Fires — active fires (last 24h, Portugal bbox)",
  "https://api.globalforestwatch.org/v1/viirs-active-fires?geostore=8e6c912c25ec11d54bd3e8bb3e90835a&period=2026-07-03,2026-07-04",
  "gfw-fires-portugal"
);

// GFW geostore — get Portugal's geostore ID
await probe(
  "GFW Geostore — search 'Portugal'",
  "https://api.globalforestwatch.org/v1/geostore?country=PT",
  "gfw-geostore-portugal"
);

// ============================================================
// 4. OpenStreetMap — fire stations and water points (OSM tags)
// ============================================================
console.log("\n" + "=".repeat(72));
console.log("OpenStreetMap — fire infrastructure (Overpass API)");
console.log("=".repeat(72));

// Overpass query for fire stations in Portugal
const overpassQuery = `[out:json][timeout:15];
(
  node["amenity"="fire_station"](36.5,-9.5,42.2,-6.2);
);
out body;`;
const overpassUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;

await probe(
  "Overpass — fire stations in Portugal",
  overpassUrl,
  "osm-fire-stations"
);

console.log("\n✓ Round 3 reconnaissance complete");
