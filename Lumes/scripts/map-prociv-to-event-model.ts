// Map Prociv ArcGIS schema → Ember Event model
// Run targeted queries for wildfire-type occurrences and produce
// a field-by-field mapping analysis

import { writeFile, mkdir, readFile } from "fs/promises";
import { existsSync } from "fs";

const OUTPUT_DIR = "/home/z/my-project/download/prociv-capture";
if (!existsSync(OUTPUT_DIR)) await mkdir(OUTPUT_DIR, { recursive: true });

const SVC_BASE = "https://services-eu1.arcgis.com/VlrHb7fn5ewYhX6y/arcgis/rest/services";
const QUERY_URL = `${SVC_BASE}/OcorrenciasSite/FeatureServer/0/query`;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; Ember-Platform-Research/0.1)",
  "Accept": "application/json",
  "Referer": "https://experience.arcgis.com/",
};

async function query(label: string, where: string, slug: string): Promise<any> {
  const params = new URLSearchParams({
    f: "geojson",
    where,
    outFields: "*",
    returnGeometry: "true",
    resultRecordCount: "10",
    orderByFields: "DataOcorrencia DESC",
  });
  const url = `${QUERY_URL}?${params.toString()}`;
  console.log(`\n→ ${label}`);
  console.log(`  where: ${where}`);
  try {
    const res = await fetch(url, { headers: HEADERS });
    const text = await res.text();
    await writeFile(`${OUTPUT_DIR}/${slug}.json`, text, "utf8");
    const json = JSON.parse(text);
    console.log(`  HTTP ${res.status} · ${json.features?.length ?? 0} features · saved`);
    return json;
  } catch (err: unknown) {
    console.log(`  ✗ ${err instanceof Error ? err.message : String(err)}`);
    return { features: [] };
  }
}

// ============================================================
// 1. Wildfire-specific query (RASI typically uses 11xx codes for fires)
// ============================================================
// Try a few filters in sequence to find wildfire-type occurrences
const wildfireQuery = await query(
  "Wildfire occurrences (Natureza LIKE '11%')",
  "Natureza LIKE '11%'",
  "query-wildfires-natureza-11"
);

const ruralFireQuery = await query(
  "Rural fires (RASI contains 'Incêndio')",
  "RASI LIKE '%Incêndio%'",
  "query-wildfires-rasi-incendio"
);

const allRecentQuery = await query(
  "All recent occurrences (last 7 days by DataDosDados)",
  "DataDosDados > 1782508800000",
  "query-all-recent"
);

// ============================================================
// 2. Print distinct values seen for key classification fields
// ============================================================
console.log("\n" + "=".repeat(72));
console.log("DISTINCT VALUES IN CAPTURED DATA");
console.log("=".repeat(72));

const allFeatures = [
  ...(wildfireQuery.features || []),
  ...(ruralFireQuery.features || []),
  ...(allRecentQuery.features || []),
];

if (allFeatures.length > 0) {
  const distinct = (field: string) =>
    Array.from(new Set(allFeatures.map((f: any) => f.properties?.[field]).filter(Boolean)));

  console.log(`\nDistinct EstadoOcorrencia (status text):`);
  for (const v of distinct("EstadoOcorrencia")) console.log(`  • ${v}`);

  console.log(`\nDistinct EstadoAgrupado (grouped status):`);
  for (const v of distinct("EstadoAgrupado")) console.log(`  • ${v}`);

  console.log(`\nDistinct CodEstadoOcorrencia (status code):`);
  for (const v of distinct("CodEstadoOcorrencia")) console.log(`  • ${v}`);

  console.log(`\nDistinct Natureza (incident type):`);
  for (const v of distinct("Natureza").slice(0, 15)) console.log(`  • ${v}`);

  console.log(`\nDistinct RASI (incident category):`);
  for (const v of distinct("RASI").slice(0, 15)) console.log(`  • ${v}`);

  console.log(`\nDistinct Regiao (region):`);
  for (const v of distinct("Regiao")) console.log(`  • ${v}`);

  console.log(`\nDistinct Simbol (symbol label):`);
  for (const v of distinct("Simbol").slice(0, 10)) console.log(`  • ${v}`);
}

// ============================================================
// 3. Field-by-field mapping to Ember Event model
// ============================================================
console.log("\n" + "=".repeat(72));
console.log("MAPPING — Prociv → Ember Event schema");
console.log("=".repeat(72));

const mapping: Array<{
  procivField: string;
  procivType: string;
  emberPath: string;
  mapping: "direct" | "transform" | "properties" | "derived" | "unused";
  notes: string;
}> = [
  { procivField: "ID_oc", procivType: "OID", emberPath: "source_internal_id", mapping: "direct", notes: "Stable OBJECTID — perfect dedup key" },
  { procivField: "Numero", procivType: "string", emberPath: "properties.numero", mapping: "properties", notes: "ANEPC occurrence number (year+sequence). Useful for cross-reference." },
  { procivField: "ID", procivType: "string", emberPath: "properties.id_ocorrencia", mapping: "properties", notes: "Long form ID — may equal source_internal_id in some records" },
  { procivField: "CodEstadoOcorrencia", procivType: "smallint", emberPath: "properties.status_code", mapping: "properties", notes: "Integer status code. NOT a coded domain — text comes from parallel field." },
  { procivField: "EstadoOcorrencia", procivType: "string", emberPath: "properties.status_text", mapping: "properties", notes: "Fine-grained status text. Code→text is NOT 1:1 (multiple texts per code)." },
  { procivField: "EstadoAgrupado", procivType: "string", emberPath: "properties.status_group", mapping: "properties", notes: "Coarser status grouping ('Em Despacho', 'Em Curso', etc.) — closest to our IncidentStatus" },
  { procivField: "DataInicioOcorrencia", procivType: "string", emberPath: "observed_at", mapping: "transform", notes: "PT-format string 'DD/MM/YYYY HH:MM' → ISO 8601. Use this NOT DataOcorrencia." },
  { procivField: "DataOcorrencia", procivType: "date (epoch ms)", emberPath: "properties.data_ocorrencia_epoch", mapping: "properties", notes: "Epoch millis — alternate representation of same time. Use as fallback." },
  { procivField: "Data", procivType: "date-only", emberPath: "properties.data", mapping: "properties", notes: "ISO date string (YYYY-MM-DD)" },
  { procivField: "Hora", procivType: "string", emberPath: "properties.hora", mapping: "properties", notes: "HH:MM string" },
  { procivField: "Ano", procivType: "smallint", emberPath: "properties.ano", mapping: "properties", notes: "Year — useful for partitioning" },
  { procivField: "Duracao", procivType: "string", emberPath: "properties.duracao", mapping: "properties", notes: "Duration string 'DD/HH:MM' — would need parsing for any computation" },
  { procivField: "DuracaoMinutos", procivType: "int", emberPath: "properties.duracao_minutos", mapping: "properties", notes: "Duration in minutes — direct numeric, preferred over Duracao" },
  { procivField: "FaseIncendio", procivType: "string(3)", emberPath: "properties.fase_incendio", mapping: "properties", notes: "Fire phase code (3 chars). '---' for non-fire events. Useful wildfire filter." },
  { procivField: "CodNatureza", procivType: "smallint", emberPath: "properties.natureza_code", mapping: "properties", notes: "Incident type code. 11xx = fires (urban/rural). Needs full code table." },
  { procivField: "Natureza", procivType: "string", emberPath: "properties.natureza_text", mapping: "properties", notes: "Type text e.g. '3313 - Movimento de massa'. Code+text pre-joined." },
  { procivField: "Regiao", procivType: "string", emberPath: "geo_enrichment.region (cross-check)", mapping: "derived", notes: "PT region name. We can cross-check against our DGT-based enrichment." },
  { procivField: "SubRegiao", procivType: "string", emberPath: "geo_enrichment.subregion", mapping: "derived", notes: "PT NUTS3-equivalent subregion." },
  { procivField: "Concelho", procivType: "string", emberPath: "geo_enrichment.municipality (cross-check)", mapping: "derived", notes: "Municipality name. Cross-check with our DGT CAOP enrichment." },
  { procivField: "Freguesia", procivType: "string", emberPath: "geo_enrichment.parish (cross-check)", mapping: "derived", notes: "Parish name." },
  { procivField: "Localidade", procivType: "string", emberPath: "properties.localidade", mapping: "properties", notes: "Locality name — too granular for enrichment schema, store as property." },
  { procivField: "Endereco", procivType: "string", emberPath: "properties.endereco", mapping: "properties", notes: "Free-text address / road reference" },
  { procivField: "OperacionaisTerrestres", procivType: "smallint", emberPath: "properties.personnel_ground", mapping: "properties", notes: "Ground personnel count" },
  { procivField: "OPAereos", procivType: "smallint", emberPath: "properties.personnel_aerial", mapping: "properties", notes: "Aerial personnel count" },
  { procivField: "Operacionais", procivType: "smallint", emberPath: "properties.personnel_total", mapping: "properties", notes: "Total personnel" },
  { procivField: "MeiosTerrestres", procivType: "smallint", emberPath: "properties.assets_ground", mapping: "properties", notes: "Ground vehicles/engines count" },
  { procivField: "MeiosAereos", procivType: "smallint", emberPath: "properties.assets_aerial", mapping: "properties", notes: "Aircraft count" },
  { procivField: "QuantEntidades", procivType: "smallint", emberPath: "properties.org_count", mapping: "properties", notes: "Number of responding organizations" },
  { procivField: "Latitude", procivType: "double", emberPath: "geometry.coordinates[1]", mapping: "direct", notes: "WGS84 latitude — direct" },
  { procivField: "Longitude", procivType: "double", emberPath: "geometry.coordinates[0]", mapping: "direct", notes: "WGS84 longitude — direct" },
  { procivField: "DDD/DDM/DMS", procivType: "string", emberPath: "—", mapping: "unused", notes: "Redundant coordinate formatting — drop" },
  { procivField: "DataDosDados", procivType: "date (epoch ms)", emberPath: "properties.data_snapshot", mapping: "properties", notes: "Snapshot timestamp — when this record was extracted from operational system. Critical for freshness SLA." },
  { procivField: "Simbol", procivType: "string", emberPath: "properties.simbol", mapping: "properties", notes: "Symbol label e.g. '33 - Em Curso'. Numeric prefix maps to map symbology." },
  { procivField: "RASI", procivType: "string", emberPath: "properties.rasi", mapping: "properties", notes: "Resumo Agrupado de Situações de Intervenção — ANEPC's incident category. Use for filtering wildfire vs. non-wildfire." },
];

console.log("\nField mapping (36 source fields → Ember Event schema):\n");
console.log("  Prociv field                    Type              Ember path                                Mapping    Notes");
console.log("  " + "-".repeat(150));
for (const m of mapping) {
  console.log(`  ${m.procivField.padEnd(30)} ${m.procivType.padEnd(18)} ${m.emberPath.padEnd(40)} ${m.mapping.padEnd(10)} ${m.notes.slice(0, 70)}`);
}

// Count mapping categories
const counts = mapping.reduce((acc, m) => {
  acc[m.mapping] = (acc[m.mapping] || 0) + 1;
  return acc;
}, {} as Record<string, number>);

console.log("\nMapping summary:");
console.log(`  Direct (clean 1:1):     ${counts.direct || 0}`);
console.log(`  Transform (parse):      ${counts.transform || 0}`);
console.log(`  Properties (preserved): ${counts.properties || 0}`);
console.log(`  Derived (cross-check):  ${counts.derived || 0}`);
console.log(`  Unused (drop):          ${counts.unused || 0}`);

// ============================================================
// 4. Save the mapping as JSON for the connector spec
// ============================================================
await writeFile(
  `${OUTPUT_DIR}/field-mapping.json`,
  JSON.stringify(mapping, null, 2),
  "utf8"
);

// ============================================================
// 5. Build a sample normalized Event from a real captured record
// ============================================================
console.log("\n" + "=".repeat(72));
console.log("SAMPLE — One real record normalized to Ember Event schema");
console.log("=".repeat(72));

if (allRecentQuery.features?.[0]) {
  const raw = allRecentQuery.features[0].properties;

  // PT date string → ISO 8601
  const ptDate = raw.DataInicioOcorrencia; // "DD/MM/YYYY HH:MM"
  const [date, time] = ptDate.split(" ");
  const [day, month, year] = date.split("/");
  const isoObservedAt = `${year}-${month}-${day}T${time}:00Z`;

  const normalizedEvent = {
    // Identity
    id: "(assigned by Event Engine)",
    schema_version: "1.0",
    source_id: "anepc-prociv-arcgis",
    source_internal_id: String(raw.ID_oc),

    // Temporal
    observed_at: isoObservedAt,
    ingested_at: new Date().toISOString(),
    valid_until: null,

    // Spatial
    geometry: { type: "Point", coordinates: [raw.Longitude, raw.Latitude] },
    geo_enrichment: "(to be computed by Geo Engine from coordinates)",
    accuracy_m: 100,

    // Source-specific
    source_type: "official",
    properties: {
      numero: raw.Numero,
      status_code: raw.CodEstadoOcorrencia,
      status_text: raw.EstadoOcorrencia,
      status_group: raw.EstadoAgrupado,
      natureza_code: raw.CodNatureza,
      natureza_text: raw.Natureza,
      rasi: raw.RASI,
      simbol: raw.Simbol,
      fase_incendio: raw.FaseIncendio,
      personnel_total: raw.Operacionais,
      personnel_ground: raw.OperacionaisTerrestres,
      personnel_aerial: raw.OPAereos,
      assets_ground: raw.MeiosTerrestres,
      assets_aerial: raw.MeiosAereos,
      org_count: raw.QuantEntidades,
      municipality_source: raw.Concelho,
      parish_source: raw.Freguesia,
      localidade: raw.Localidade,
      endereco: raw.Endereco,
      duration_minutes: raw.DuracaoMinutos,
      data_snapshot: raw.DataDosDados,
    },

    // Trust
    trust: {
      confidence: 0.92, // official source baseline
      source_reputation: 0.95,
      verification_status: "officially-verified",
      corroboration_count: 0,
      corroborating_sources: [],
      freshness_score: 0.85,
      computed_at: new Date().toISOString(),
      computation_version: "1.0",
    },

    // Aggregation
    incident_id: null,
    aggregation_status: "pending",
  };

  console.log("\nNormalized Event:");
  console.log(JSON.stringify(normalizedEvent, null, 2));

  await writeFile(
    `${OUTPUT_DIR}/sample-normalized-event.json`,
    JSON.stringify(normalizedEvent, null, 2),
    "utf8"
  );
}

console.log("\n✓ All analysis artifacts saved to " + OUTPUT_DIR);
