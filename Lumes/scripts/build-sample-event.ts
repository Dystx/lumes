// Build a sample normalized Event from a captured wildfire record
import { writeFile } from "fs/promises";

const OUTPUT_DIR = "/home/z/my-project/download/prociv-capture";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; Ember-Platform-Research/0.1)",
  "Accept": "application/json",
  "Referer": "https://experience.arcgis.com/",
};

const SVC_BASE = "https://services-eu1.arcgis.com/VlrHb7fn5ewYhX6y/arcgis/rest/services";
const QUERY_URL = `${SVC_BASE}/OcorrenciasSite/FeatureServer/0/query`;

const params = new URLSearchParams({
  f: "geojson",
  where: "RASI LIKE '%Incêndio%'",
  outFields: "*",
  returnGeometry: "true",
  resultRecordCount: "5",
  orderByFields: "DataOcorrencia DESC",
});

const res = await fetch(`${QUERY_URL}?${params}`, { headers: HEADERS });
const json: any = await res.json();

if (!json.features?.length) {
  console.log("No wildfire records captured");
  process.exit(1);
}

const raw = json.features[0].properties;
console.log("Raw wildfire record:");
console.log(JSON.stringify(raw, null, 2));

// PT date string → ISO 8601
const [date, time] = raw.DataInicioOcorrencia.split(" ");
const [day, month, year] = date.split("/");
const isoObservedAt = `${year}-${month}-${day}T${time}:00Z`;

// Determine if this is a wildfire vs urban fire based on RASI
const isRural = raw.RASI?.includes("Rurais");
const isUrban = raw.RASI?.includes("Urbanos");
const eventType = isRural ? "wildfire" : isUrban ? "urban_fire" : "other";

// Map EstadoAgrupado → IncidentStatus (our enum)
const statusMap: Record<string, string> = {
  "Em Despacho": "detected",
  "Em Curso": "active",
  "Em Resolução": "contained",
  "Concluída": "resolved",
  "Encerrada": "resolved",
};
const incidentStatus = statusMap[raw.EstadoAgrupado] ?? "detected";

// Map to severity (this is a heuristic — real severity would need area + proximity to populated areas)
const personnel = raw.Operacionais || 0;
const aircraft = raw.MeiosAereos || 0;
let severity = "low";
if (aircraft >= 2 || personnel >= 30) severity = "critical";
else if (aircraft >= 1 || personnel >= 15) severity = "high";
else if (personnel >= 5) severity = "medium";

const normalizedEvent = {
  // === Identity ===
  id: "(assigned by Event Engine at ingestion)",
  schema_version: "1.0",
  source_id: "anepc-prociv-arcgis",
  source_internal_id: String(raw.ID_oc),

  // === Temporal ===
  observed_at: isoObservedAt,
  ingested_at: new Date().toISOString(),
  valid_until: null,

  // === Spatial ===
  geometry: { type: "Point", coordinates: [raw.Longitude, raw.Latitude] },
  geo_enrichment: "(computed by Geo Engine: municipality, parish, district, IPMA risk zone)",
  accuracy_m: 100,

  // === Source-specific payload (preserved as JSONB) ===
  source_type: "official",
  properties: {
    // Identity / cross-reference
    numero: raw.Numero,                    // ANEPC year+sequence number
    id_ocorrencia: raw.ID,

    // Status (both code and text preserved — code→text is NOT 1:1 in source)
    status_code: raw.CodEstadoOcorrencia,
    status_text: raw.EstadoOcorrencia,
    status_group: raw.EstadoAgrupado,

    // Incident classification
    natureza_code: raw.CodNatureza,
    natureza_text: raw.Natureza,
    rasi: raw.RASI,                        // e.g. "Incêndios Rurais DECIR"
    simbol: raw.Simbol,                    // e.g. "31 - Em Curso"
    fase_incendio: raw.FaseIncendio,       // "---" for non-fire, phase code for fires

    // Resources deployed
    personnel_total: raw.Operacionais,
    personnel_ground: raw.OperacionaisTerrestres,
    personnel_aerial: raw.OPAereos,
    assets_ground: raw.MeiosTerrestres,
    assets_aerial: raw.MeiosAereos,
    org_count: raw.QuantEntidades,

    // Location (free-text — used as cross-check against our DGT-based geo enrichment)
    localidade: raw.Localidade,
    endereco: raw.Endereco,
    municipio_source: raw.Concelho,
    freguesia_source: raw.Freguesia,
    regiao_source: raw.Regiao,
    subregiao_source: raw.SubRegiao,

    // Temporal extras
    duration_minutes: raw.DuracaoMinutos,
    data_snapshot: raw.DataDosDados,       // when ANEPC extracted this from SGO
  },

  // === Trust envelope ===
  trust: {
    confidence: 0.92,                      // official source baseline
    source_reputation: 0.95,               // ANEPC is authoritative for status
    verification_status: "officially-verified",
    corroboration_count: 0,                // will increment as satellite/community events join
    corroborating_sources: [],
    freshness_score: 0.85,                 // decays with age since DataDosDados
    computed_at: new Date().toISOString(),
    computation_version: "1.0",
  },

  // === Aggregation ===
  incident_id: null,                       // assigned by aggregation engine
  aggregation_status: "pending",

  // === Type tag (enables the polymorphic Generic Event Model) ===
  // This is the field that lets the same schema hold wildfires, floods,
  // landslides, etc. — sourced from RASI / Natureza
  event_type: eventType,
  event_subtype: raw.Natureza,             // e.g. "3101 - Povoamento Florestal"

  // === Derived display fields (computed by Event Engine) ===
  derived: {
    incident_status: incidentStatus,
    severity,
    display_name: `${raw.Localidade} (${raw.Concelho})`,
  },
};

console.log("\n" + "=".repeat(72));
console.log("SAMPLE — Real wildfire record normalized to Ember Event schema");
console.log("=".repeat(72));
console.log(JSON.stringify(normalizedEvent, null, 2));

await writeFile(
  `${OUTPUT_DIR}/sample-normalized-event.json`,
  JSON.stringify(normalizedEvent, null, 2),
  "utf8"
);

console.log(`\n✓ Saved to ${OUTPUT_DIR}/sample-normalized-event.json`);
