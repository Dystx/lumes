// Event Model Spec — Ember Platform
const fs = require("fs");
const U = require("./docx-utils");
const { h1, h2, h3, body, bodyMixed, bullet, numbered, code,
        tableTitle, tableCaption, dataTable, spacer, calloutBox,
        buildDocument, PB } = U;
const { TextRun, Paragraph, PageBreak, AlignmentType, HeadingLevel,
        LevelFormat, TableOfContents } = U.docx;

const numberingConfigs = [];
["lst-event", "lst-incident", "lst-aggregation", "lst-trust", "lst-geo",
 "lst-versioning", "lst-query"].forEach((ref) => {
  numberingConfigs.push({
    reference: ref,
    levels: [{
      level: 0,
      format: LevelFormat.DECIMAL,
      text: "%1.",
      alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 720, hanging: 360 } } },
    }],
  });
});

const bodyChildren = [];

// ============ TOC PAGE ============
bodyChildren.push(new Paragraph({
  spacing: { before: 200, after: 300 },
  alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: "Table of Contents", bold: true, size: 36,
    color: PB.primary, font: { ascii: "Calibri", eastAsia: "SimHei" } })],
}));
bodyChildren.push(new TableOfContents("Table of Contents", {
  hyperlink: true,
  headingStyleRange: "1-3",
}));
bodyChildren.push(new Paragraph({
  spacing: { before: 100, after: 0 },
  alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: "Right-click the table of contents and select \"Update Field\" to refresh page numbers.",
    italics: true, size: 18, color: PB.secondary, font: { ascii: "Calibri" } })],
}));
bodyChildren.push(new Paragraph({ children: [new PageBreak()] }));

// ============ EXECUTIVE SUMMARY ============
bodyChildren.push(h1("Executive Summary"));

bodyChildren.push(body(
  "This document specifies the event model that underpins the Ember platform. The event model is the schema " +
  "and the operations that govern how observable wildfire information — satellite detections, official " +
  "bulletins, community reports, news articles, weather observations — is represented, stored, queried, and " +
  "aggregated into the user-facing concept of an Incident."
));

bodyChildren.push(body(
  "The model rests on a single architectural commitment: the strict separation between an Event (an immutable " +
  "observation with provenance) and an Incident (a mutable aggregate of related Events). This separation is " +
  "not a database normalization nicety. It is the architectural decision that determines whether the platform " +
  "can grow from a live map into a prevention platform, an AI intelligence layer, and a professional toolset " +
  "without a re-architecture. Existing fire maps typically conflate observations with the thing being observed; " +
  "this conflation works for display but breaks under aggregation, historical analysis, and multi-source " +
  "reasoning."
));

bodyChildren.push(body(
  "The document is written for engineers implementing the Event Engine, for data scientists building AI " +
  "features on top of the event stream, and for institutional partners who need to understand the platform's " +
  "data semantics. It is deliberately explicit about field types, constraints, and operations — anything " +
  "left implicit will be interpreted differently by different implementers, and that ambiguity will compound " +
  "into system-wide inconsistencies."
));

bodyChildren.push(body(
  "The model is versioned. The current version is 1.0. Versioning is not a formality — every event carries " +
  "the schema version under which it was created, and consumers must handle cross-version queries gracefully. " +
  "Future versions will add fields and operations but will not remove or repurpose existing ones; backward " +
  "compatibility is a hard constraint."
));

// ============ 1. CORE CONCEPTS ============
bodyChildren.push(h1("1. Core Concepts"));

bodyChildren.push(h2("1.1 The Atom: Event"));
bodyChildren.push(body(
  "An Event is the atomic unit of observation in the platform. Every piece of information the platform " +
  "handles — a NASA FIRMS hotspot detection, an ANEPC press release, a community smoke report, a news article " +
  "geolocated to a fire — is normalized into an Event. Events are immutable: once created, they never change. " +
  "New observations create new Events; corrections create new Events that reference the original; retractions " +
  "create new Events that mark the original as retracted."
));

bodyChildren.push(body(
  "Immutability is a strong claim with strong consequences. It means the event store is an append-only log, " +
  "which simplifies replication, backup, and audit. It means the platform can always reconstruct the state " +
  "of the world at any past time by replaying events. It means AI features can re-process historical data " +
  "without worrying that the data has changed underneath them. The cost is storage — the event store grows " +
  "monotonically — but storage is cheap, and the benefits are architectural."
));

bodyChildren.push(body(
  "An Event is not a fact. It is an observation. A NASA FIRMS detection is an observation that a satellite " +
  "instrument detected a thermal anomaly at a particular location and time; it is not a fact that a wildfire " +
  "exists at that location. An ANEPC bulletin saying a fire is contained is an observation that ANEPC " +
  "communicated containment at a particular time; it is not a fact that the fire is contained (it may " +
  "rekindle). This distinction — observation vs. fact — is preserved throughout the platform's semantics " +
  "and surfaces in the trust envelope, which quantifies the platform's confidence in the observation."
));

bodyChildren.push(h2("1.2 The Aggregate: Incident"));
bodyChildren.push(body(
  "An Incident is the user-facing concept of a wildfire. When a citizen opens the platform and sees a pin on " +
  "the map, that pin represents an Incident, not an Event. When the notification engine alerts a user that " +
  "a fire has started near them, it is alerting on Incident creation. When the professional dashboard shows " +
  "a summary of an active fire, it is summarizing an Incident."
));

bodyChildren.push(body(
  "An Incident is a mutable aggregate of Events. Unlike Events, Incidents change over time: their status " +
  "evolves (detected → active → contained → resolved), their geometry may shift as new satellite detections " +
  "arrive, their estimated area grows or shrinks, their trust envelope tightens as corroboration accumulates. " +
  "These mutations are governed by the aggregation logic (see Section 5) and are always reconstructable from " +
  "the underlying Events."
));

bodyChildren.push(body(
  "The relationship between Events and Incidents is many-to-one: an Incident has many Events, an Event belongs " +
  "to at most one Incident. (An Event may belong to no Incident, if it has not yet been clustered; this is " +
  "the case for the first few seconds after a community report is submitted.) The aggregation logic that " +
  "assigns Events to Incidents is the most complex piece of the Event Engine; it is discussed in detail in " +
  "Section 5."
));

bodyChildren.push(h2("1.3 Why the Separation Matters"));
bodyChildren.push(body(
  "The separation between Event and Incident is the single most important architectural commitment in the " +
  "platform. To see why, consider the alternative: a single \"fire\" table that conflates observations with " +
  "the thing being observed. This is the design most existing fire maps use, and it works fine for displaying " +
  "the current state of active fires. It fails catastrophically when the platform tries to do any of the " +
  "following:"
));

bodyChildren.push(numbered("Historical analysis: How many fires were detected within 5 km of this village in the last 5 years? A conflated table loses the per-observation provenance needed to answer this accurately — a single fire may have been detected by multiple satellites and reported by multiple community members, and conflating these into one row obscures the detection coverage.", "lst-event", 0));
bodyChildren.push(numbered("Multi-source reasoning: When NASA FIRMS detects a hotspot and ANEPC later confirms a fire at the same location, the platform needs to know these are two observations of the same fire, not two fires. A conflated table cannot represent this.", "lst-event", 0));
bodyChildren.push(numbered("AI training: AI features need labeled examples — a corpus of Events, each with known ground truth. A conflated table provides only the latest state, not the temporal evolution that AI models need to learn from.", "lst-event", 0));
bodyChildren.push(numbered("Audit and accountability: When a professional dashboard user asks \"why does this fire show as contained?\", the platform must be able to point to the specific ANEPC bulletin that established containment. A conflated table loses this provenance.", "lst-event", 0));
bodyChildren.push(numbered("Conflict resolution: When two sources disagree about a fire's status, the platform needs to preserve both observations and let the trust engine resolve them. A conflated table can only store one status at a time.", "lst-event", 0));

bodyChildren.push(body(
  "The Event/Incident separation is not free. It adds complexity to queries (most user-facing queries join " +
  "Events to Incidents), it requires an aggregation engine, and it forces every consumer to think about the " +
  "distinction. The team has judged these costs worthwhile because the alternative — re-architecting a " +
  "conflated model when the platform tries to add Phase 5+ features — is far more expensive."
));

// ============ 2. EVENT SCHEMA ============
bodyChildren.push(h1("2. Event Schema"));

bodyChildren.push(h2("2.1 Schema Overview"));
bodyChildren.push(body(
  "The Event schema is the contract every source connector must produce. It is intentionally minimal: anything " +
  "that can be derived is derived, not stored. The schema is defined in TypeScript for clarity but is " +
  "implemented in PostgreSQL with JSONB for the properties and trust fields."
));

bodyChildren.push(code(
`interface Event {
  // === Identity ===
  id: string;                       // UUID, assigned by Event Engine
  schema_version: string;           // "1.0" — see Section 9
  source_id: string;                // connector sourceId
  source_internal_id: string;       // source-specific identifier

  // === Temporal ===
  observed_at: string;              // ISO 8601, when observation was made
  ingested_at: string;              // ISO 8601, when Event Engine received it
  valid_until: string | null;       // null = still valid; timestamp = superseded

  // === Spatial ===
  geometry: GeoJSON.Geometry;       // Point, LineString, or Polygon
  geo_enrichment: GeoEnrichment;   // derived (see Section 6)
  accuracy_m: number;               // estimated spatial accuracy in meters

  // === Source-specific ===
  source_type: SourceType;          // satellite | official | community | news | weather
  properties: Record<string, any>;  // source-specific payload

  // === Trust ===
  trust: TrustEnvelope;             // see Section 7

  // === Aggregation ===
  incident_id: string | null;       // set by aggregation logic
  aggregation_status: AggregationStatus;  // pending | assigned | orphaned

  // === Audit ===
  created_at: string;               // Event creation timestamp (= ingested_at)
  retracted_by: string | null;      // ID of retracting Event, if retracted
  supersedes: string | null;        // ID of Event this one supersedes
}`
));

bodyChildren.push(h2("2.2 Field Specifications"));

bodyChildren.push(h3("2.2.1 Identity Fields"));
bodyChildren.push(body(
  "The id field is a UUID v4 assigned by the Event Engine at ingestion. It is the primary key for the event " +
  "and the only identifier used in cross-engine references. The source_id and source_internal_id together " +
  "identify the event within its source; the combination is unique and is used for deduplication."
));

bodyChildren.push(body(
  "The schema_version field is critical for evolution. Every event carries the schema version under which it " +
  "was created; consumers must handle events from earlier versions gracefully. Version 1.0 is the initial " +
  "release; future versions will follow semantic versioning (major.minor), with major versions reserved for " +
  "breaking changes (which the platform commits to avoiding without a migration path)."
));

bodyChildren.push(h3("2.2.2 Temporal Fields"));
bodyChildren.push(body(
  "The observed_at field is when the observation was made, not when the platform received it. For satellite " +
  "detections, this is the satellite acquisition time. For official bulletins, this is the publication " +
  "timestamp. For community reports, this is the time the user submits the report (or, if the user reports " +
  "something they saw earlier, the time they say they saw it). The ingested_at field is when the Event " +
  "Engine received and processed the observation; the difference between observed_at and ingested_at is " +
  "ingestion latency, a key observability metric."
));

bodyChildren.push(body(
  "The valid_until field is null when the event is current, and a timestamp when the event has been " +
  "superseded by a newer observation. A NASA FIRMS detection that is later refined by a higher-resolution " +
  "VIIRS detection is marked valid_until = (new event's observed_at). This allows historical queries to " +
  "reconstruct the state of the world at any past time."
));

bodyChildren.push(h3("2.2.3 Spatial Fields"));
bodyChildren.push(body(
  "The geometry field is a GeoJSON Geometry — typically a Point for satellite detections and community " +
  "reports, occasionally a Polygon for official burned-area reports. The platform uses WGS84 (EPSG:4326) " +
  "consistently; no other coordinate system is supported. The accuracy_m field is the estimated spatial " +
  "accuracy of the observation in meters, used by the trust engine and by aggregation logic (two observations " +
  "within each other's accuracy circles are candidates for the same fire)."
));

bodyChildren.push(body(
  "The geo_enrichment field is the derived spatial context: municipality, parish, district, nearest road, " +
  "forest zone, IPMA risk zone. It is computed once at ingestion time and stored on the event; it is not " +
  "recomputed on read. The enrichment pipeline is described in Section 6."
));

bodyChildren.push(h3("2.2.4 Source-Specific Fields"));
bodyChildren.push(body(
  "The source_type field is an enum that drives downstream processing. Satellite events are clustered " +
  "aggressively (multiple overpasses of the same fire should aggregate). Official events have higher base " +
  "trust and may bind Events into Incidents overriding spatial-temporal logic. Community events feed the " +
  "reputation system. News events are deduplicated against each other (the same story syndicated across " +
  "publishers should not produce multiple events)."
));

bodyChildren.push(body(
  "The properties field is the source-specific payload, preserved as JSONB. It contains everything the source " +
  "provided that does not fit into the common schema: NASA FIRMS FRP and brightness, ANEPC resource counts, " +
  "news article URL and snippet, community report photo URLs. The platform never interprets this field " +
  "directly; source-specific logic in the normalization layer extracts what is needed."
));

bodyChildren.push(h3("2.2.5 Trust Field"));
bodyChildren.push(body(
  "The trust field is the TrustEnvelope (see Section 7). It is computed at ingestion time and updated " +
  "asynchronously as corroboration arrives and source reputation evolves. Trust updates produce trust-" +
  "change events on the event bus, allowing downstream engines to react."
));

bodyChildren.push(h3("2.2.6 Aggregation Fields"));
bodyChildren.push(body(
  "The incident_id field is set by the aggregation logic. A new event starts with incident_id = null and " +
  "aggregation_status = 'pending'; the aggregation engine processes pending events within seconds and " +
  "either assigns them to an existing Incident, creates a new Incident, or marks them 'orphaned' (no " +
  "matching Incident found and creation criteria not met). Orphaned events are periodically re-evaluated " +
  "as new events arrive."
));

bodyChildren.push(h2("2.3 Source Type Taxonomy"));
bodyChildren.push(tableTitle("Table 2.1: Source Types"));
bodyChildren.push(dataTable(
  ["Source Type", "Examples", "Aggregation Behavior", "Default Trust"],
  [
    ["satellite", "NASA FIRMS MODIS/VIIRS", "Aggressive clustering", "0.3-0.9 (source-provided)"],
    ["official", "ANEPC, ICNF bulletins", "Binding (overrides spatial-temporal)", "0.9"],
    ["community", "User reports (smoke, flame, etc.)", "Standard clustering + reputation", "0.3-0.9 (per reporter)"],
    ["news", "Geolocated news articles", "Dedup by content similarity", "0.5-0.7 (per publisher)"],
    ["weather", "IPMA observations", "Not clustered (context only)", "0.95"],
  ],
  { colWidths: [16, 26, 32, 26] }
));

bodyChildren.push(h2("2.4 PostgreSQL Implementation"));
bodyChildren.push(body(
  "The Event schema is implemented in PostgreSQL with the PostGIS extension. The events table is partitioned " +
  "by observed_at month, which keeps individual partitions small enough for efficient vacuuming and archival. " +
  "Spatial indexing uses GIST on the geometry column; temporal indexing uses B-tree on observed_at."
));

bodyChildren.push(code(
`CREATE TABLE events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_version  TEXT NOT NULL DEFAULT '1.0',
  source_id       TEXT NOT NULL,
  source_internal_id TEXT NOT NULL,

  observed_at     TIMESTAMPTZ NOT NULL,
  ingested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until     TIMESTAMPTZ,

  geometry        geometry(Geometry, 4326) NOT NULL,
  geo_enrichment  JSONB,
  accuracy_m      REAL NOT NULL DEFAULT 1000,

  source_type     TEXT NOT NULL CHECK (source_type IN
                    ('satellite','official','community','news','weather')),
  properties      JSONB NOT NULL DEFAULT '{}',

  trust           JSONB NOT NULL,

  incident_id     UUID REFERENCES incidents(id),
  aggregation_status TEXT NOT NULL DEFAULT 'pending'
                    CHECK (aggregation_status IN
                      ('pending','assigned','orphaned')),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  retracted_by    UUID REFERENCES events(id),
  supersedes      UUID REFERENCES events(id)
) PARTITION BY RANGE (observed_at);

CREATE INDEX idx_events_geometry ON events USING GIST (geometry);
CREATE INDEX idx_events_observed ON events USING btree (observed_at DESC);
CREATE INDEX idx_events_incident ON events USING btree (incident_id);
CREATE INDEX idx_events_source   ON events USING btree (source_id, source_internal_id);
CREATE UNIQUE INDEX idx_events_dedup ON events (source_id, source_internal_id);`
));

// ============ 3. INCIDENT SCHEMA ============
bodyChildren.push(h1("3. Incident Schema"));

bodyChildren.push(h2("3.1 Schema Overview"));
bodyChildren.push(body(
  "The Incident schema is the user-facing aggregate. Unlike Events, Incidents are mutable — their state " +
  "evolves as new Events arrive. The Event Engine is the sole writer of Incident state; all other engines " +
  "read-only. Mutation is governed by the aggregation logic and is always reconstructable from the underlying " +
  "Events."
));

bodyChildren.push(code(
`interface Incident {
  // === Identity ===
  id: string;                       // UUID
  schema_version: string;
  created_at: string;               // first event's ingested_at
  updated_at: string;               // last mutation timestamp

  // === Lifecycle ===
  status: IncidentStatus;           // detected | active | contained | resolved | monitoring
  status_changed_at: string;
  severity: Severity;               // low | medium | high | critical
  severity_changed_at: string;

  // === Aggregation ===
  first_event_id: string;           // event that triggered creation
  latest_event_id: string;          // most recent event
  event_count: number;              // total events
  source_diversity: number;         // distinct source types contributing

  // === Spatial ===
  centroid: GeoJSON.Point;          // geographic center
  bounding_box: GeoJSON.Polygon;    // bounding box of all events
  estimated_area_ha: number;        // derived from satellite + official

  // === Trust ===
  trust_summary: TrustSummary;      // aggregate trust (see Section 7.7)

  // === Display ===
  display_name: string;             // e.g., "Cape Point Fire"
  summary: string | null;           // AI-generated summary (Phase 6+)

  // === Audit ===
  mutation_log: MutationEntry[];    // history of state changes
}`
));

bodyChildren.push(h2("3.2 Lifecycle States"));
bodyChildren.push(body(
  "An Incident moves through a defined lifecycle. Transitions are not arbitrary — each is triggered by " +
  "specific Event patterns, and each is logged in the mutation_log. The lifecycle is deliberately simple; " +
  "complex status taxonomies look good in specs but fail in practice because operators cannot apply them " +
  "consistently under pressure."
));

bodyChildren.push(tableTitle("Table 3.1: Incident Lifecycle States"));
bodyChildren.push(dataTable(
  ["State", "Entry Criteria", "Display Treatment"],
  [
    ["detected", "First satellite or community event; no official confirmation", "Subtle styling; \"unconfirmed\" label"],
    ["active", "Confirmed fire (multiple sources or official bulletin)", "Prominent styling; pulsing marker"],
    ["contained", "Official bulletin states containment, OR 2+ hours since last detection", "Standard styling; \"contained\" label"],
    ["resolved", "Official bulletin states resolution, OR 24+ hours since last detection", "Faded styling; \"resolved\" label"],
    ["monitoring", "Resolved but under observation (e.g., high risk of rekindle)", "Minimal styling; \"monitoring\" label"],
  ],
  { colWidths: [16, 50, 34] }
));

bodyChildren.push(body(
  "Transitions between states are governed by explicit rules. A detected Incident becomes active when an " +
  "official Event confirms it, or when three independent satellite/community Events corroborate within 30 " +
  "minutes. An active Incident becomes contained when an official Event states containment, or when no new " +
  "detection Events arrive for 2 hours and the last known satellite pass was clear. These rules are " +
  "versioned and tunable; changes are recorded in the mutation log with the rule version that produced them."
));

bodyChildren.push(h2("3.3 Severity Levels"));
bodyChildren.push(body(
  "Severity is the platform's assessment of how dangerous an Incident is. It is derived from multiple factors: " +
  "estimated area, proximity to populated areas, IPMA fire risk level, and presence of evacuation orders. " +
  "Severity is recomputed whenever a new Event joins the Incident and may move up or down as the situation " +
  "evolves."
));

bodyChildren.push(tableTitle("Table 3.2: Severity Levels"));
bodyChildren.push(dataTable(
  ["Severity", "Criteria (any one)", "Notification Priority"],
  [
    ["critical", "> 100 ha OR evacuation order OR imminent threat to populated area", "Critical (bypass quiet hours)"],
    ["high", "> 10 ha OR within 2 km of populated area OR Very High IPMA risk zone", "Standard"],
    ["medium", "> 1 ha OR within 5 km of populated area", "Standard"],
    ["low", "< 1 ha AND remote", "Informational"],
  ],
  { colWidths: [14, 56, 30] }
));

bodyChildren.push(h2("3.4 Mutation Log"));
bodyChildren.push(body(
  "Every state change is recorded in the mutation_log. This provides a complete audit trail of how the " +
  "Incident evolved, which is essential for post-incident analysis and for professional users who need to " +
  "understand the basis for the current state."
));

bodyChildren.push(code(
`interface MutationEntry {
  timestamp: string;
  field: string;                    // 'status' | 'severity' | 'estimated_area_ha' | ...
  old_value: any;
  new_value: any;
  triggering_event_id: string;      // event that caused this mutation
  rule_version: string;             // version of the rule that produced this
  reason: string;                   // human-readable explanation
}`
));

// ============ 4. EVENT TYPES ============
bodyChildren.push(h1("4. Event Types"));

bodyChildren.push(h2("4.1 Type Catalog"));
bodyChildren.push(body(
  "Within the source_type taxonomy, Events have a more specific type that determines their semantic role in " +
  "the platform. A satellite detection, a satellite refinement, and a satellite clearance are all source_type " +
  "= 'satellite' but have different types and trigger different processing."
));

bodyChildren.push(tableTitle("Table 4.1: Event Types"));
bodyChildren.push(dataTable(
  ["Type", "Source Type", "Description", "Aggregation Impact"],
  [
    ["detection", "satellite / community", "New fire detection", "May create new Incident or join existing"],
    ["refinement", "satellite", "Higher-resolution detection of known fire", "Updates Incident geometry/area"],
    ["clearance", "satellite", "Clear-sky pass with no detection", "Contributes to containment logic"],
    ["status_change", "official", "Official status update (active/contained/resolved)", "Forces Incident state transition"],
    ["area_update", "official / satellite", "Updated area estimate", "Updates Incident estimated_area_ha"],
    ["deployment", "official", "Resource deployment (aircraft, engines)", "Adds to Incident properties"],
    ["evacuation", "official", "Evacuation order", "Forces severity to critical"],
    ["report", "community", "User-submitted report", "May create or join Incident"],
    ["confirmation", "community", "User confirms existing report", "Boosts trust of confirmed event"],
    ["retraction", "any", "Source retracts previous event", "Marks original event retracted"],
    ["article", "news", "News article published", "Attaches to Incident timeline"],
    ["weather", "weather", "Weather observation", "Adds context to Incident"],
  ],
  { colWidths: [16, 18, 32, 34] }
));

bodyChildren.push(h2("4.2 Event Type Semantics"));

bodyChildren.push(h3("4.2.1 Detection Events"));
bodyChildren.push(body(
  "Detection Events are the primary signal that a fire exists. They are produced by satellite sources (NASA " +
  "FIRMS) and community sources (smoke/flame reports). A Detection Event that does not match any existing " +
  "Incident within the aggregation window creates a new Incident; one that matches joins the existing " +
  "Incident and updates its trust envelope through corroboration."
));

bodyChildren.push(h3("4.2.2 Status Change Events"));
bodyChildren.push(body(
  "Status Change Events are produced exclusively by official sources. They have the highest trust weight and " +
  "can force Incident state transitions regardless of the spatial-temporal logic. When an ANEPC bulletin " +
  "states a fire is contained, the corresponding Status Change Event forces the Incident to 'contained' " +
  "status, even if satellite detections are still arriving (the satellite may be detecting residual heat, " +
  "not active flaming)."
));

bodyChildren.push(h3("4.2.3 Evacuation Events"));
bodyChildren.push(body(
  "Evacuation Events are the highest-stakes Event type. They are produced by official sources only — community " +
  "reports of evacuation must be routed through official channels for verification before the platform treats " +
  "them as Evacuation Events. An Evacuation Event forces the Incident's severity to 'critical' and triggers " +
  "critical-priority notifications to all users with geofences intersecting the evacuation zone."
));

bodyChildren.push(h3("4.2.4 Retraction Events"));
bodyChildren.push(body(
  "Retraction Events are how the platform corrects errors without violating immutability. When a source " +
  "retracts a previous communication (an ANEPC bulletin is corrected, a news article is retracted, a community " +
  "report is withdrawn), the platform creates a new Event of type 'retraction' that references the original " +
  "Event via the retracted_by field. The original Event is not deleted; it is marked as retracted, and " +
  "downstream consumers are expected to honor the retraction."
));

bodyChildren.push(body(
  "Retraction handling is non-trivial. If a retracted Event was the sole basis for an Incident's existence, " +
  "the Incident may need to be dissolved (if no other Events support it) or re-evaluated (if other Events " +
  "remain but with reduced trust). The aggregation engine handles these cases with explicit rules; the " +
  "mutation log records the retraction's effect on the Incident."
));

// ============ 5. AGGREGATION LOGIC ============
bodyChildren.push(h1("5. Aggregation Logic"));

bodyChildren.push(h2("5.1 The Aggregation Problem"));
bodyChildren.push(body(
  "Aggregation is the process by which Events become Incidents. It is one of the hardest problems in the " +
  "platform and one of the most important to get right. The naive approach — cluster Events within a fixed " +
  "spatial and temporal window — fails in practice because fire behavior is not uniform. A small agricultural " +
  "fire burns out in an hour; a major wildfire burns for weeks and migrates tens of kilometers. A fixed " +
  "window that works for one fails for the other."
));

bodyChildren.push(body(
  "Ember's aggregation logic is multi-strategy. The primary strategy is spatial-temporal clustering with " +
  "adaptive parameters. The secondary strategy is official binding. The tertiary strategy (Phase 6+) is " +
  "AI-assisted clustering. The strategies are applied in order; each can override the previous."
));

bodyChildren.push(h2("5.2 Primary Strategy: Spatial-Temporal Clustering"));
bodyChildren.push(body(
  "The primary strategy clusters Events that are close in space and time. The clustering parameters are " +
  "adaptive — they depend on the Incident's existing size and age, not fixed thresholds. A new Event is a " +
  "candidate to join an existing Incident if it is within the Incident's current bounding box (expanded by " +
  "a margin proportional to the Incident's age) and within 6 hours of the Incident's most recent Event."
));

bodyChildren.push(code(
`function shouldJoinIncident(event: Event, incident: Incident): boolean {
  // Spatial check: within expanded bounding box
  const expansion = Math.min(5000, incident.estimated_area_ha * 100);
  const expandedBox = expandBox(incident.bounding_box, expansion);
  if (!intersects(event.geometry, expandedBox)) return false;

  // Temporal check: within 6 hours of most recent event
  const latestEvent = getEvent(incident.latest_event_id);
  const hoursSince = (Date.parse(event.observed_at) - Date.parse(latestEvent.observed_at)) / 3600000;
  if (hoursSince > 6) return false;

  // Accuracy check: within combined accuracy circles
  const distance = distanceMeters(event.geometry, incident.centroid);
  if (distance > event.accuracy_m + 2000) return false;

  return true;
}`
));

bodyChildren.push(body(
  "If a new Event matches multiple Incidents (which can happen when two fires are burning close together), " +
  "the aggregation logic uses additional signals: source type (an official Event is more likely to bind " +
  "correctly than a satellite Event), trust envelope (higher-trust Events bind more confidently), and " +
  "geographic features (a mountain ridge between two Incidents is a strong signal they are separate fires). " +
  "When the logic cannot decide, the Event is assigned to the closest Incident and flagged for review."
));

bodyChildren.push(h2("5.3 Secondary Strategy: Official Binding"));
bodyChildren.push(body(
  "When an official source (ANEPC, ICNF) issues a bulletin that references a specific Incident — by name, " +
  "location, or operational identifier — the official Event binds to that Incident, overriding the spatial-" +
  "temporal logic. This handles the case where ANEPC's view of an Incident's extent differs from the " +
  "satellite-derived view: the official view prevails for status fields, the satellite view prevails for " +
  "geometry and area."
));

bodyChildren.push(body(
  "Official binding is the mechanism that handles Incident merging and splitting. If an official bulletin " +
  "indicates that two Incidents the platform had been tracking separately are in fact one fire, the official " +
  "Event triggers a merge operation: the two Incidents become one, all Events are re-assigned, and the " +
  "mutation log records the merge. Conversely, if a satellite detection reveals that what the platform " +
  "treated as one Incident is in fact two distinct hotspots, a split operation divides the Incident."
));

bodyChildren.push(h2("5.4 Tertiary Strategy: AI-Assisted Clustering (Phase 6+)"));
bodyChildren.push(body(
  "Phase 6 introduces AI-assisted clustering to handle edge cases the rule-based strategies miss. The AI " +
  "model takes as input the candidate Event, the candidate Incident, and the Incident's recent Event " +
  "history, and produces a join probability. The model is trained on historical data labeled by the rule-" +
  "based strategies plus manual review of ambiguous cases. AI clustering is advisory — it does not replace " +
  "the rule-based strategies but overrides them when its confidence is high and the rules are uncertain."
));

bodyChildren.push(h2("5.5 Aggregation Operations"));
bodyChildren.push(body(
  "The aggregation engine supports four operations: create (a new Incident from an unassigned Event), join " +
  "(assign an Event to an existing Incident), merge (combine two Incidents into one), and split (divide one " +
  "Incident into two). Each operation is logged and reversible — the mutation log captures enough information " +
  "to undo any operation, which is essential for correcting aggregation errors."
));

bodyChildren.push(tableTitle("Table 5.1: Aggregation Operations"));
bodyChildren.push(dataTable(
  ["Operation", "Trigger", "Effect on Incident(s)"],
  [
    ["create", "Detection Event with no matching Incident", "New Incident created with the Event as first_event"],
    ["join", "Detection Event matching an existing Incident", "Event added to Incident; geometry/area/trust updated"],
    ["merge", "Official Event indicating two Incidents are one", "Second Incident's Events reassigned to first; second marked merged"],
    ["split", "Satellite refinement showing two distinct hotspots", "New Incident created; relevant Events reassigned"],
    ["dissolve", "All Events in an Incident retracted", "Incident marked dissolved; not displayed"],
  ],
  { colWidths: [16, 36, 48] }
));

bodyChildren.push(h2("5.6 Aggregation Conflicts"));
bodyChildren.push(body(
  "Aggregation is not always clean. Two satellites may produce contradictory detections; an official bulletin " +
  "may reference a fire that the platform cannot locate with confidence; a community report may be ambiguous " +
  "between two nearby Incidents. The aggregation engine does not silently resolve these conflicts — it " +
  "preserves both candidates and flags the Incident for review."
));

bodyChildren.push(calloutBox(
  "Aggregation Conflict Resolution",
  "When the aggregation logic cannot decide between multiple candidate Incidents for a new Event, the Event " +
  "is assigned to the most likely candidate but flagged with aggregation_status = 'ambiguous'. The trust " +
  "envelope reflects the ambiguity with a reduced confidence. Phase 6+ AI clustering is expected to resolve " +
  "most ambiguities automatically; until then, ambiguous assignments are reviewed weekly by the data team."
));

// ============ 6. GEO ENRICHMENT ============
bodyChildren.push(h1("6. Geo Enrichment"));

bodyChildren.push(h2("6.1 Enrichment Pipeline"));
bodyChildren.push(body(
  "Every Event with a geometry is enriched with administrative and contextual spatial information. Enrichment " +
  "is performed once at ingestion time and stored on the Event; it is not recomputed on read. The enrichment " +
  "pipeline uses DGT administrative boundaries and IPMA risk zones, executed as PostGIS spatial joins."
));

bodyChildren.push(code(
`interface GeoEnrichment {
  municipality: string;             // from CAOP (DGT)
  municipality_code: string;        // INE code, e.g., "1106" for Lisbon
  parish: string;                   // from BGRI (DGT)
  parish_code: string;
  district: string;                 // from CAOP
  district_code: string;
  nuts2: string;                    // NUTS II region (e.g., "Continente", "Açores")
  nuts3: string;                    // NUTS III region
  nearest_road: {
    name: string;
    distance_m: number;
  };
  forest_zone: string | null;       // from ICNF, if available
  ipma_risk_zone: {
    risk_level: 'reduced' | 'moderate' | 'high' | 'very_high' | 'maximum';
    as_of: string;                  // date of risk assessment
  };
  protected_area: string | null;    // if within a protected area (PN, etc.)
  populated_place: {
    name: string;
    distance_m: number;
  } | null;
}`
));

bodyChildren.push(h2("6.2 Enrichment Refresh"));
bodyChildren.push(body(
  "Administrative boundaries change annually (CAOP updates), and IPMA risk zones change daily. The enrichment " +
  "stored on an Event is the enrichment at the time of ingestion — historical Events retain their original " +
  "enrichment, even if boundaries have since changed. This is the correct behavior for historical analysis " +
  "(an Event from 2024 should reflect 2024 boundaries) but means that current-risk queries must join against " +
  "the current IPMA risk table, not use the stored enrichment."
));

bodyChildren.push(h2("6.3 Spatial Accuracy"));
bodyChildren.push(body(
  "The accuracy_m field on each Event represents the estimated spatial accuracy of the observation. For NASA " +
  "FIRMS, this is the pixel resolution at the detection (1-2 km for MODIS, 375 m for VIIRS). For community " +
  "reports, it depends on the report source (GPS-enabled mobile reports are accurate to ~10 m; web-submitted " +
  "reports are accurate to whatever the user specified). The accuracy is used by aggregation logic and by " +
  "the trust engine (more accurate observations carry slightly higher trust, all else equal)."
));

// ============ 7. TRUST ENVELOPE ============
bodyChildren.push(h1("7. Trust Envelope"));

bodyChildren.push(h2("7.1 Envelope Structure"));
bodyChildren.push(body(
  "Every Event carries a TrustEnvelope — a structured object capturing the platform's assessment of the " +
  "Event's reliability. The envelope is computed at ingestion time and updated asynchronously as new " +
  "information arrives. The structure is identical for all source types; the inputs differ."
));

bodyChildren.push(code(
`interface TrustEnvelope {
  // === Quantitative ===
  confidence: number;               // 0-1, primary trust signal
  source_reputation: number;        // 0-1, rolling reputation of source
  reporter_reputation: number | null; // 0-1, for community reports
  freshness_score: number;          // 0-1, decays with age

  // === Qualitative ===
  verification_status: 'unverified' | 'single-source' | 'corroborated' | 'officially-verified';
  corroboration_count: number;
  corroborating_sources: string[];

  // === Computation metadata ===
  computed_at: string;
  computation_version: string;      // algorithm version
  inputs: {
    source_weight: number;
    corroboration_weight: number;
    freshness_weight: number;
    reporter_weight: number;
  };
}`
));

bodyChildren.push(h2("7.2 Confidence Computation"));
bodyChildren.push(body(
  "The confidence score is the primary trust signal. It is a weighted combination of source reputation, " +
  "corroboration, freshness, and (for community reports) reporter reputation. The weights are tunable per " +
  "source type and are recorded in the envelope for transparency."
));

bodyChildren.push(code(
`// Confidence formula (version 1.0)
function computeConfidence(event: Event, context: TrustContext): number {
  const w = getWeights(event.source_type);  // {source, corroboration, freshness, reporter}

  const sourceScore = context.sourceReputation;
  const corrobScore = 1 - (1 / (1 + context.corroborationCount));
  const freshScore = freshnessDecay(event.observed_at, context.freshnessHalflife);
  const reporterScore = context.reporterReputation ?? 0.5;

  return w.source * sourceScore
       + w.corroboration * corrobScore
       + w.freshness * freshScore
       + w.reporter * reporterScore;
}

function freshnessDecay(observedAt: string, halflifeHours: number): number {
  const ageHours = (Date.now() - Date.parse(observedAt)) / 3600000;
  return Math.max(0, 1 - ageHours / halflifeHours);
}

// Default weights per source type
const WEIGHTS = {
  satellite: { source: 0.4, corroboration: 0.3, freshness: 0.2, reporter: 0.1 },
  official:  { source: 0.5, corroboration: 0.2, freshness: 0.2, reporter: 0.1 },
  community: { source: 0.3, corroboration: 0.2, freshness: 0.2, reporter: 0.3 },
  news:      { source: 0.4, corroboration: 0.3, freshness: 0.2, reporter: 0.1 },
  weather:   { source: 0.7, corroboration: 0.1, freshness: 0.1, reporter: 0.1 },
};`
));

bodyChildren.push(h2("7.3 Verification Status Ladder"));
bodyChildren.push(body(
  "Verification status is the qualitative complement to confidence. It captures whether the Event has been " +
  "confirmed by independent sources, which is a stronger signal than confidence alone. The ladder is " +
  "monotonic — an Event can only move up (more verified), never down."
));

bodyChildren.push(tableTitle("Table 7.1: Verification Status Transitions"));
bodyChildren.push(dataTable(
  ["From", "To", "Trigger"],
  [
    ["(new)", "unverified", "Event created with single source"],
    ["unverified", "single-source", "Source reputation exceeds 0.7"],
    ["single-source", "corroborated", "Second independent source confirms"],
    ["corroborated", "officially-verified", "Official source confirms"],
    ["(any)", "(any)", "Status can only move up, never down"],
  ],
  { colWidths: [22, 26, 52] }
));

bodyChildren.push(h2("7.4 Source Reputation Updates"));
bodyChildren.push(body(
  "Source reputation is a rolling score, recomputed nightly, based on the source's historical accuracy. The " +
  "update uses a Bayesian approach: each event contributes evidence for or against the source's reliability. " +
  "A NASA FIRMS detection later confirmed by ANEPC is positive evidence; one later determined to be a " +
  "controlled burn (false positive) is negative evidence. The update is conservative to avoid overreacting " +
  "to single events."
));

bodyChildren.push(code(
`// Bayesian reputation update (simplified)
function updateReputation(current: BetaDistribution, event: ReputationEvent): BetaDistribution {
  // Beta(α, β) where α = positive evidence, β = negative evidence
  const alpha = current.alpha + (event.outcome === 'positive' ? event.weight : 0);
  const beta = current.beta + (event.outcome === 'negative' ? event.weight : 0);
  return { alpha, beta, mean: alpha / (alpha + beta) };
}

// Reputation = mean of Beta distribution
// Initial: Beta(9, 1) → mean = 0.9 for high-trust sources (official)
// Initial: Beta(5, 5) → mean = 0.5 for unverified sources (community)
// Update weight: 1.0 for confirmed outcomes, 0.5 for inferred outcomes`
));

bodyChildren.push(h2("7.5 Corroboration Detection"));
bodyChildren.push(body(
  "Corroboration is detected when a second independent source produces an Event matching an existing Event " +
  "within the corroboration window (default: 30 minutes, 2 km). \"Independent\" means different source_type " +
  "or different source_id; two NASA FIRMS detections of the same fire are not independent, but a NASA FIRMS " +
  "detection and a community smoke report are."
));

bodyChildren.push(body(
  "When corroboration is detected, the original Event's trust envelope is updated: verification_status moves " +
  "to 'corroborated' (or stays at 'corroborated' if already there), corroboration_count increments, " +
  "corroborating_sources gains the new source, and confidence is recomputed with the higher corroboration " +
  "score. The trust change is published to the event bus, allowing downstream engines to react."
));

bodyChildren.push(h2("7.6 Trust Decay and Re-evaluation"));
bodyChildren.push(body(
  "Trust is not static. As time passes without corroboration, confidence decays (via the freshness_score " +
  "term). As new corroboration arrives, confidence jumps. As a source's reputation changes, historical " +
  "events from that source are retroactively re-scored. The Trust Engine runs a continuous re-evaluation " +
  "job that processes these updates and publishes trust-change events to the bus."
));

bodyChildren.push(body(
  "Re-evaluation is batched for efficiency. The job runs every 5 minutes and processes events whose trust " +
  "may have changed: events with new corroboration, events from sources whose reputation changed, and events " +
  "approaching freshness thresholds. Full re-evaluation of all events runs nightly as a background job."
));

bodyChildren.push(h2("7.7 Incident Trust Summary"));
bodyChildren.push(body(
  "An Incident's trust_summary is the aggregate trust of its member Events. It is not a simple average — " +
  "it captures the diversity of sources contributing (more diverse sources = higher trust) and the maximum " +
  "verification status achieved (an Incident with an officially-verified Event is officially-verified, " +
  "regardless of the average confidence of its other Events)."
));

bodyChildren.push(code(
`interface TrustSummary {
  max_confidence: number;           // highest member Event confidence
  mean_confidence: number;          // weighted mean (weighted by source reputation)
  verification_status: VerificationStatus;  // highest member status
  source_diversity: number;         // count of distinct source_types
  corroborating_source_count: number;  // distinct source_ids
  last_updated: string;
}`
));

// ============ 8. QUERY PATTERNS ============
bodyChildren.push(h1("8. Query Patterns"));

bodyChildren.push(h2("8.1 Common Queries"));
bodyChildren.push(body(
  "The Event Engine exposes a query API that supports the patterns the platform needs. The most common " +
  "patterns are summarized below; each is implemented as a parameterized query against the events table " +
  "with appropriate spatial and temporal indexes."
));

bodyChildren.push(tableTitle("Table 8.1: Common Query Patterns"));
bodyChildren.push(dataTable(
  ["Pattern", "Use Case", "Index Used"],
  [
    ["Active incidents in viewport", "Map rendering", "GIST geometry + status filter"],
    ["Incidents near point", "'Fires near me'", "GIST with ST_DWithin"],
    ["Incidents in polygon", "Following a municipality", "GIST with ST_Contains"],
    ["Incident timeline", "Incident detail view", "B-tree on incident_id + observed_at"],
    ["Historical fires in region", "Prevention analysis", "GIST + B-tree on observed_at range"],
    ["Events by source", "Source health analysis", "B-tree on source_id + observed_at"],
    ["Trust changes since T", "Realtime trust updates", "B-tree on trust.computed_at"],
  ],
  { colWidths: [28, 32, 40] }
));

bodyChildren.push(h2("8.2 Performance Considerations"));
bodyChildren.push(body(
  "The events table grows quickly — a busy fire season may produce millions of events. Performance depends " +
  "on three factors: partitioning (by observed_at month, keeping partitions small), indexing (GIST for " +
  "spatial, B-tree for temporal and source filters), and query structure (avoiding full-table scans). The " +
  "team monitors query latency and adds indexes or materialized views as patterns emerge."
));

bodyChildren.push(h2("8.3 Caching Strategy"));
bodyChildren.push(body(
  "Read-heavy queries (active incidents in viewport, incident detail) are cached in Redis with a 30-second " +
  "TTL. Cache invalidation is event-driven: when an Event joins an Incident, the Incident's cache entry is " +
  "invalidated. The cache is a performance optimization, not a source of truth — cache misses fall through " +
  "to the database, and stale cache is corrected within 30 seconds."
));

bodyChildren.push(h1("9. Versioning and Evolution"));

bodyChildren.push(h2("9.1 Schema Versioning"));
bodyChildren.push(body(
  "The event schema is versioned. The current version is 1.0. Future versions follow semantic versioning: " +
  "minor versions add fields or operations (backward compatible); major versions change existing semantics " +
  "(requires migration). Every event carries its schema version; consumers must handle events from earlier " +
  "versions gracefully."
));

bodyChildren.push(body(
  "The platform commits to never issuing a major version without a migration path. If a major version becomes " +
  "necessary (e.g., renaming a field that was misleadingly named), the old version remains queryable for at " +
  "least 12 months, with a clear deprecation timeline. This commitment is essential because the platform " +
  "aspires to be a long-term data asset; partners who build on it must trust that it will not break their " +
  "workflows."
));

bodyChildren.push(h2("9.2 Trust Algorithm Versioning"));
bodyChildren.push(body(
  "The trust algorithm is versioned independently of the schema. Every trust envelope carries a " +
  "computation_version identifying the algorithm that produced it. When the algorithm changes, new events " +
  "use the new version; historical events retain their original computation_version. The team must decide " +
  "whether to retroactively re-score historical events (which produces a cleaner dataset but obscures the " +
  "audit trail) or accept version drift (which preserves the audit trail but complicates cross-time " +
  "comparisons). The current lean is toward the latter."
));

bodyChildren.push(h2("9.3 Migration Path"));
bodyChildren.push(body(
  "When schema or algorithm changes require migration, the path is: (1) deploy the new code that can read " +
  "both old and new formats; (2) backfill new fields or recompute affected events in batches; (3) deploy " +
  "code that writes only the new format; (4) after a confidence period, deprecate the old format. This path " +
  "ensures zero downtime and preserves the audit trail throughout the migration."
));

bodyChildren.push(h1("10. Conclusion"));

bodyChildren.push(body(
  "The event model specified in this document is the architectural commitment that makes Ember a platform " +
  "rather than a map. The Event/Incident separation, the trust envelope, the multi-strategy aggregation, " +
  "and the versioned evolution together form a model that can support the platform's growth from a citizen " +
  "MVP to a multi-source, AI-enhanced, professionally-deployed public safety intelligence layer."
));

bodyChildren.push(body(
  "The model is not the simplest possible. A single \"fire\" table would be simpler, faster to implement, " +
  "and easier to reason about — for the citizen MVP. The model's complexity is justified by what it enables: " +
  "multi-source aggregation, historical analysis, AI training, audit, and conflict resolution. Each of these " +
  "is a Phase 5+ feature that would require a re-architecture under the simpler model. The team has judged " +
  "that paying the complexity cost up front is cheaper than paying the re-architecture cost later."
));

bodyChildren.push(body(
  "The model will evolve. The open questions — aggregation parameter tuning, AI clustering integration, " +
  "multi-country geo enrichment — will be resolved through operational experience and incorporated into " +
  "future versions of this specification. The discipline the team commits to is that every change will " +
  "preserve backward compatibility, will be versioned, and will be documented here before it is deployed. " +
  "The event model is the platform's load-bearing wall; it deserves that level of care."
));

// === Build document ===
const coverConfig = {
  title: "Event Model Specification",
  subtitle: "Ember Platform — Events, Incidents, Trust, and Aggregation",
  englishLabel: "EVENT MODEL SPECIFICATION",
  metaLines: [
    "Document Type:  Data Model Specification",
    "Version:  1.0  (Initial Release)",
    "Status:  Draft for Collaborator Review",
    "Date:  July 2026",
    "Codename:  Ember",
  ],
  footerLeft: "Ember Platform — Event Model Spec",
  footerRight: "Confidential — Internal",
};

const doc = buildDocument({
  coverConfig,
  bodyChildren,
  headerTitle: "Ember — Event Model Spec",
});

doc.numbering.config = numberingConfigs;

const outputPath = "/home/z/my-project/download/Ember-Event-Model-Spec.docx";
U.docx.Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(outputPath, buf);
  console.log(`✓ Event Model Spec DOCX written: ${outputPath}`);
  console.log(`  Size: ${(buf.length / 1024).toFixed(1)} KB`);
}).catch(err => {
  console.error("✗ Generation failed:", err);
  process.exit(1);
});
