// Fetch real EFFIS fire data as GeoJSON via WFS
// These endpoints are the gold mine — let's capture actual data

import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";

const OUT = "/home/z/my-project/download/source-recon";
if (!existsSync(OUT)) await mkdir(OUT, { recursive: true });

const WFS_BASE = "https://ies-ows.jrc.ec.europa.eu/effis/wfs";
const H = {
  "User-Agent": "Mozilla/5.0 (compatible; Ember-Platform-Research/0.1)",
  "Accept": "application/json, application/geo+json",
};

async function wfsGet(label: string, typeName: string, slug: string, maxFeatures = 50) {
  const params = new URLSearchParams({
    service: "WFS",
    version: "1.0.0",
    request: "GetFeature",
    typeName,
    outputFormat: "application/json",
    maxFeatures: String(maxFeatures),
  });
  const url = `${WFS_BASE}?${params.toString()}`;
  console.log(`\n→ ${label}`);
  console.log(`  layer: ${typeName}`);
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 25000);
    const r = await fetch(url, { headers: H, signal: c.signal });
    clearTimeout(t);
    const txt = await r.text();
    await writeFile(`${OUT}/${slug}.json`, txt, "utf8");
    console.log(`  [${r.status}] ${Buffer.byteLength(txt)} bytes · ${slug}.json`);
    let json: any = null;
    try { json = JSON.parse(txt); } catch {}
    if (json?.features) {
      console.log(`  Features: ${json.features.length}`);
      if (json.features[0]) {
        console.log(`  Sample feature properties:`);
        console.log("    " + JSON.stringify(json.features[0].properties, null, 2).split("\n").join("\n    ").slice(0, 800));
        console.log(`  Sample geometry: ${json.features[0].geometry?.type}`);
      }
    } else if (json?.featureMembers) {
      const keys = Object.keys(json.featureMembers);
      console.log(`  featureMembers keys: ${keys.length}`);
    }
    return json;
  } catch (e) {
    console.log(`  ✗ ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

console.log("=".repeat(72));
console.log("EFFIS WFS — Real-time fire data fetch");
console.log("=".repeat(72));

// === 1. Latest Hot Spots (active fire detections) ===
const hotSpots = await wfsGet(
  "Latest Hot Spots (active fires)",
  "ercc.hs_24hrs_point",
  "effis-hotspots-24h",
  100
);

// === 2. Burned areas — current season (polygons!) ===
const burnedAreas = await wfsGet(
  "Current Season Burned Areas (last 30 days, polygons)",
  "ercc.ba",
  "effis-burned-areas-season",
  50
);

// === 3. Burned areas — last 24h (points) ===
const burnedAreas24h = await wfsGet(
  "Burned Areas last 24 hours (points)",
  "ercc.ba_24hrs_point",
  "effis-burned-areas-24h",
  100
);

// === 4. Filter to Portugal via BBOX (mainland + islands roughly) ===
console.log("\n" + "=".repeat(72));
console.log("Portugal-filtered queries");
console.log("=".repeat(72));

async function wfsBbox(label: string, typeName: string, slug: string, bbox: string, maxFeatures = 50) {
  const params = new URLSearchParams({
    service: "WFS",
    version: "1.0.0",
    request: "GetFeature",
    typeName,
    outputFormat: "application/json",
    maxFeatures: String(maxFeatures),
    bbox,
    srsName: "EPSG:4326",
  });
  const url = `${WFS_BASE}?${params.toString()}`;
  console.log(`\n→ ${label}`);
  console.log(`  bbox: ${bbox}`);
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 25000);
    const r = await fetch(url, { headers: H, signal: c.signal });
    clearTimeout(t);
    const txt = await r.text();
    await writeFile(`${OUT}/${slug}.json`, txt, "utf8");
    console.log(`  [${r.status}] ${Buffer.byteLength(txt)} bytes`);
    let json: any = null;
    try { json = JSON.parse(txt); } catch {}
    if (json?.features) {
      console.log(`  Features in Portugal: ${json.features.length}`);
      if (json.features[0]) {
        console.log(`  Sample:`);
        console.log("    " + JSON.stringify(json.features[0], null, 2).split("\n").join("\n    ").slice(0, 1000));
      }
    }
    return json;
  } catch (e) {
    console.log(`  ✗ ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

// Portugal mainland bbox: -9.5,36.5,-6,42.5
// Include Madeira/Azores roughly: -31,30,-6,43
await wfsBbox(
  "Hot Spots in Portugal mainland",
  "ercc.hs_24hrs_point",
  "effis-hotspots-portugal",
  "-9.5,36.5,-6,42.5",
  50
);

await wfsBbox(
  "Burned areas in Portugal mainland (last 30 days)",
  "ercc.ba",
  "effis-burned-portugal",
  "-9.5,36.5,-6,42.5",
  50
);

console.log("\n✓ All WFS data captured");
