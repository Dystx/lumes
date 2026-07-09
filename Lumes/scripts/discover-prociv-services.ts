// Discover the real Prociv ArcGIS services
// 1. Fetch the Experience Builder config to find configured data sources
// 2. List the ArcGIS REST services directory
// 3. Probe likely FeatureServer/MapServer endpoints

import { writeFile, mkdir, readFile } from "fs/promises";
import { existsSync } from "fs";

const OUTPUT_DIR = "/home/z/my-project/download/prociv-capture";
if (!existsSync(OUTPUT_DIR)) await mkdir(OUTPUT_DIR, { recursive: true });

const HEADERS = {
  "User-Agent": "Ember-Platform-Research/0.1 (wildfire-intel)",
  "Accept": "application/json, text/plain;q=0.5",
};

async function fetchJson(label: string, url: string): Promise<{ status: number; body: string; json: any | null }> {
  console.log(`\n→ ${label}`);
  console.log(`  ${url}`);
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
    return { status: res.status, body: text, json };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ✗ ${msg}`);
    return { status: 0, body: "", json: null };
  }
}

// ============================================================
// Step 1: Fetch Experience Builder config — reveals data sources
// ============================================================
const EXP_BUILDER_ITEM_ID = "29e83f11f7a34339b35364e483e3846f";
const EXP_BUILDER_DATA_URL = `https://prociv-portal.geomai.mai.gov.pt/arcgis/sharing/rest/content/items/${EXP_BUILDER_ITEM_ID}/data?f=json`;

const expConfig = await fetchJson("experience-builder-config", EXP_BUILDER_DATA_URL);

// ============================================================
// Step 2: List ArcGIS REST services directory
// ============================================================
const SERVICES_ROOT = "https://prociv-portal.geomai.mai.gov.pt/arcgis/rest/services/?f=json";
const servicesRoot = await fetchJson("arcgis-services-root", SERVICES_ROOT);

// ============================================================
// Step 3: Extract FeatureServer/MapServer URLs from config
// ============================================================
console.log("\n" + "=".repeat(72));
console.log("ANALYSIS — Data sources referenced in Experience Builder config");
console.log("=".repeat(72));

if (expConfig.json) {
  const text = JSON.stringify(expConfig.json);
  // Find all URL references that look like ArcGIS endpoints
  const urlPattern = /https?:\/\/[^"'\\\s]+?(?:FeatureServer|MapServer|arcgis\/rest\/services)[^"'\\\s]*/gi;
  const matches = Array.from(new Set(text.match(urlPattern) || []));
  console.log(`\nFound ${matches.length} unique ArcGIS service URL fragments:`);
  for (const m of matches) {
    console.log(`  • ${m}`);
  }

  // Also look for any "url" or "dataSource" fields
  const dsPattern = /"url"\s*:\s*"([^"]+)"/gi;
  const dsMatches = Array.from(new Set((text.match(dsPattern) || []).map(s => s.replace(/.*"url"\s*:\s*"/, "").replace(/"$/, ""))));
  console.log(`\nFound ${dsMatches.length} "url" field values:`);
  for (const m of dsMatches.slice(0, 30)) {
    console.log(`  • ${m}`);
  }
}

// ============================================================
// Step 4: List services from the REST root
// ============================================================
console.log("\n" + "=".repeat(72));
console.log("ANALYSIS — ArcGIS REST services directory");
console.log("=".repeat(72));

if (servicesRoot.json && Array.isArray(servicesRoot.json.services)) {
  console.log(`\nFound ${servicesRoot.json.services.length} services:`);
  for (const svc of servicesRoot.json.services) {
    console.log(`  • ${svc.name} (${svc.type})`);
  }
} else {
  console.log("\nNo services list returned. Raw body preview:");
  console.log(servicesRoot.body.slice(0, 500));
}

console.log("\n✓ Discovery artifacts saved to " + OUTPUT_DIR);
