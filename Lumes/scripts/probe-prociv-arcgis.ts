// Option B execution: probe SGMAI ArcGIS FeatureServer for ANPC active occurrences
// Captures raw response, analyzes schema, maps to Ember Event model

import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";

const OUTPUT_DIR = "/home/z/my-project/download/prociv-capture";
if (!existsSync(OUTPUT_DIR)) await mkdir(OUTPUT_DIR, { recursive: true });

// === Endpoint candidates ===
// The user provided one formula; let's try a few variants in case the
// service name or layer ID has changed. ArcGIS public-facing services
// often have predictable patterns.
const ENDPOINTS = [
  {
    label: "ANPC_Ocorrencias_Ativas (primary)",
    url: "https://sgmai.maps.arcgis.com/arcgis/rest/services/Publico/ANPC_Ocorrencias_Ativas/FeatureServer/0/query",
  },
  {
    label: "ANPC_Ocorrencias (variant spelling)",
    url: "https://sgmai.maps.arcgis.com/arcgis/rest/services/Publico/ANPC_Ocorrencias/FeatureServer/0/query",
  },
  {
    label: "Hosted feature server alt (services6.arcgis.com)",
    url: "https://services6.arcgis.com/sgmai/arcgis/rest/services/ANPC_Ocorrencias_Ativas/FeatureServer/0/query",
  },
];

// Standard ArcGIS query params the user described
const QUERY_PARAMS = new URLSearchParams({
  f: "geojson",
  where: "1=1",
  outFields: "*",
  returnGeometry: "true",
  // Be polite: don't ask for everything if the server is huge
  resultRecordCount: "50",
});

const HEADERS = {
  // Be a good citizen — identify the probe
  "User-Agent": "Ember-Platform-Research/0.1 (wildfire-intel; +contact@ember.pt)",
  "Accept": "application/json, application/geo+json, text/plain;q=0.5",
};

interface ProbeResult {
  endpointLabel: string;
  url: string;
  httpStatus: number | null;
  contentType: string | null;
  responseSizeBytes: number | null;
  bodyPreview: string | null; // first 1000 chars
  fullBodyPath: string | null;
  error: string | null;
  durationMs: number | null;
}

async function probeEndpoint(label: string, url: string): Promise<ProbeResult> {
  const fullUrl = `${url}?${QUERY_PARAMS.toString()}`;
  console.log(`\n→ Probing: ${label}`);
  console.log(`  URL: ${fullUrl}`);

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(fullUrl, { headers: HEADERS, signal: controller.signal });
    clearTimeout(timeout);
    const durationMs = Date.now() - start;

    const text = await res.text();
    const responseSizeBytes = Buffer.byteLength(text, "utf8");

    // Save the raw response regardless of status — even errors are useful
    const slug = label.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    const filename = `${slug}.txt`;
    const fullPath = `${OUTPUT_DIR}/${filename}`;
    await writeFile(fullPath, text, "utf8");

    return {
      endpointLabel: label,
      url: fullUrl,
      httpStatus: res.status,
      contentType: res.headers.get("content-type"),
      responseSizeBytes,
      bodyPreview: text.slice(0, 1500),
      fullBodyPath: fullPath,
      error: null,
      durationMs,
    };
  } catch (err: unknown) {
    const durationMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ✗ Error: ${msg}`);
    return {
      endpointLabel: label,
      url: fullUrl,
      httpStatus: null,
      contentType: null,
      responseSizeBytes: null,
      bodyPreview: null,
      fullBodyPath: null,
      error: msg,
      durationMs,
    };
  }
}

// === Run probes ===
console.log("=".repeat(72));
console.log("EMBER PLATFORM — Prociv ArcGIS Endpoint Probe");
console.log("=".repeat(72));

const results: ProbeResult[] = [];
for (const ep of ENDPOINTS) {
  results.push(await probeEndpoint(ep.label, ep.url));
}

// === Print probe summary ===
console.log("\n" + "=".repeat(72));
console.log("PROBE SUMMARY");
console.log("=".repeat(72));
for (const r of results) {
  console.log(`\n${r.endpointLabel}`);
  console.log(`  HTTP: ${r.httpStatus ?? "—"}  ·  ${r.durationMs}ms  ·  ${r.responseSizeBytes ?? 0} bytes`);
  console.log(`  Content-Type: ${r.contentType ?? "—"}`);
  console.log(`  Saved to: ${r.fullBodyPath ?? "(not saved)"}`);
  if (r.error) console.log(`  Error: ${r.error}`);
  if (r.bodyPreview) {
    console.log(`  Body preview (first 1500 chars):`);
    console.log("  " + r.bodyPreview.split("\n").join("\n  ").slice(0, 1200));
  }
}

// === Save summary report ===
const summaryPath = `${OUTPUT_DIR}/probe-summary.json`;
await writeFile(summaryPath, JSON.stringify(results, null, 2), "utf8");
console.log(`\n✓ Summary saved to ${summaryPath}`);
