// Data Source Inventory & Connector Spec — Ember Platform
const fs = require("fs");
const U = require("./docx-utils");
const { h1, h2, h3, body, bodyMixed, bullet, numbered, code,
        tableTitle, tableCaption, dataTable, spacer, calloutBox,
        buildDocument, PB } = U;
const { TextRun, Paragraph, PageBreak, AlignmentType, HeadingLevel,
        LevelFormat, TableOfContents } = U.docx;

const numberingConfigs = [];
["lst-sources", "lst-connector", "lst-ingestion", "lst-geo", "lst-trust",
 "lst-format", "lst-validation", "lst-error"].forEach((ref) => {
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
  "This document inventories every external data source the Ember platform intends to integrate for its Phase 1 " +
  "(citizen MVP) and Phase 2 (community layer) launches, with a forward look at sources required for later phases. " +
  "For each source, it records the licensing status, the data format, the publication cadence, the technical access " +
  "mechanism, and a connector interface contract that the implementation must satisfy."
));

bodyChildren.push(body(
  "The document is organized as a reference, not a narrative. Readers implementing a specific connector should " +
  "navigate directly to that source's section. Readers evaluating the platform's data foundations should read " +
  "Sections 1 through 3, which cover the cross-cutting connector architecture, the ingestion pipeline, and the " +
  "trust engine's interaction with source-specific properties."
));

bodyChildren.push(body(
  "A critical caveat: this document reflects the best information available at the time of writing. Several " +
  "official sources (notably ANEPC's structured-data API) require direct institutional negotiation to confirm " +
  "access terms. Where access is unconfirmed, the document records the assumption the platform is operating " +
  "under and the fallback plan if negotiation fails. No source should be considered integrated until its " +
  "section is marked \"Status: Confirmed.\""
));

bodyChildren.push(body(
  "The total source inventory for Phases 1 through 4 comprises eight sources: five official Portuguese sources " +
  "(ANEPC, IPMA, ICNF, DGT, and SGIFR where available), one international satellite source (NASA FIRMS), one " +
  "news ingestion layer (multi-publisher), and the platform's own community reporting layer. Later phases add " +
  "municipality-specific feeds, European equivalent sources for Phase 9 expansion, and commercial weather " +
  "providers for the professional platform."
));

// ============ 1. CONNECTOR ARCHITECTURE ============
bodyChildren.push(h1("1. Connector Architecture"));

bodyChildren.push(h2("1.1 The Connector Interface"));
bodyChildren.push(body(
  "Every source connector implements the same interface. This uniformity is what allows the platform to add " +
  "new sources without modifying downstream engines, and to retire failing sources without affecting others. " +
  "The interface is deliberately minimal — it specifies what a connector must do, not how it does it."
));

bodyChildren.push(code(
`interface SourceConnector {
  // Identity
  readonly sourceId: string;          // e.g. "nasa-firms"
  readonly sourceName: string;        // e.g. "NASA FIRMS MODIS"
  readonly sourceType: SourceType;    // satellite | official | community | news | weather
  readonly licenseType: LicenseType;  // public-domain | cc-by | restricted | negotiated
  readonly attribution: string;       // Required attribution text

  // Lifecycle
  initialize(config: ConnectorConfig): Promise<void>;
  healthCheck(): Promise<HealthStatus>;
  shutdown(): Promise<void>;

  // Data access
  fetchSince(timestamp: Date): AsyncGenerator<RawObservation>;
  fetchBatch(filter: FetchFilter): Promise<RawObservation[]>;

  // Metadata
  getMetadata(): SourceMetadata;      // cadence, coverage, freshness SLA
  getLastFetchStatus(): FetchStatus;  // last success/failure, queue depth
}`
));

bodyChildren.push(body(
  "The interface makes several deliberate choices. First, fetchSince returns an async generator rather than a " +
  "promise of an array — some sources return very large datasets, and streaming is essential. Second, the " +
  "interface does not include a \"push\" method; connectors are pull-based by default, with push-based sources " +
  "(webhooks) wrapped in an adapter that exposes them through the same pull interface. Third, the interface " +
  "exposes health and metadata synchronously, so the observability stack can poll connector status without " +
  "waiting for a fetch cycle."
));

bodyChildren.push(h2("1.2 The RawObservation Format"));
bodyChildren.push(body(
  "Every connector produces RawObservation objects — the pre-normalization representation of source data. The " +
  "Event Engine normalizes these into the unified Event schema (see the Event Model Spec). Keeping the raw " +
  "representation separate from the normalized one allows the platform to re-process historical data when " +
  "normalization logic changes, without re-fetching from sources."
));

bodyChildren.push(code(
`interface RawObservation {
  sourceId: string;                  // matches connector sourceId
  sourceInternalId: string;          // source-specific identifier
  observedAt: Date;                  // when the observation was made
  fetchedAt: Date;                   // when the connector fetched it
  geometry: GeoJSON.Geometry;        // point, line, or polygon
  rawPayload: unknown;               // the original source-specific payload
  parsedPayload: ParsedPayload;      // connector's best-effort structured extraction
  confidence?: number;               // source-provided confidence if available
}

interface ParsedPayload {
  // Common fields the connector extracts from rawPayload
  // All fields optional — connectors extract what they can
  title?: string;
  description?: string;
  severity?: string;
  area?: number;                     // hectares, if available
  status?: string;                   // e.g., "active", "contained"
  additionalFields?: Record<string, unknown>;
}`
));

bodyChildren.push(h2("1.3 Connector Isolation"));
bodyChildren.push(body(
  "Connectors are isolated from each other in three ways. Process isolation: each connector runs in its own " +
  "worker process, so a crash in one connector does not affect others. Configuration isolation: each connector " +
  "has its own configuration, secrets, and rate limits. State isolation: each connector maintains its own " +
  "cursor (last-fetched timestamp) and queue, so a backlog in one connector does not delay others."
));

bodyChildren.push(body(
  "This isolation is the architectural enforcement of the \"sources are independent\" principle from the " +
  "Architecture Foundations document. It rules out certain elegant-looking designs — a unified fetcher that " +
  "iterates over sources, a shared queue that all connectors consume from — because those designs couple " +
  "source lifecycles in ways that cause cascading failures."
));

bodyChildren.push(h2("1.4 Failure Modes and Recovery"));
bodyChildren.push(body(
  "Connectors fail in predictable ways. The architecture anticipates each failure mode with a defined recovery " +
  "strategy. The table below enumerates the failure modes; each connector's documentation must address how " +
  "that mode manifests for the specific source."
));

bodyChildren.push(tableTitle("Table 1.1: Connector Failure Modes"));
bodyChildren.push(dataTable(
  ["Failure Mode", "Detection", "Recovery"],
  [
    ["Source unavailable (HTTP 5xx, timeout)", "Health check failure, fetch error rate spike", "Exponential backoff; alert after 3 consecutive failures"],
    ["Authentication expired", "401/403 responses", "Automatic re-auth if refresh token available; else page on-call"],
    ["Rate limit exceeded", "429 responses", "Respect Retry-After header; reduce poll frequency"],
    ["Schema change (silent)", "Validation failure rate spike", "Alert; fall back to last-known-good parser; do not silently drop data"],
    ["Data quality regression", "Anomaly detection on parsed payloads", "Alert; flag affected events with degraded trust; do not ingest"],
    ["Backlog growth", "Queue depth > threshold", "Scale workers; alert if depth exceeds 1 hour of typical volume"],
    ["Network partition", "Sustained fetch failures from healthy source", "Retry with jitter; alert after 5 minutes"],
  ],
  { colWidths: [28, 32, 40] }
));

// ============ 2. INGESTION PIPELINE ============
bodyChildren.push(h1("2. Ingestion Pipeline"));

bodyChildren.push(h2("2.1 Pipeline Stages"));
bodyChildren.push(body(
  "Every observation passes through the same six-stage pipeline: fetch, validate, normalize, deduplicate, store, " +
  "publish. Each stage is idempotent — re-running it on the same input produces the same output — which makes " +
  "recovery from partial failures straightforward. The stages run as a stream, not a batch; an observation " +
  "flows through all six stages in sequence, typically in under a second for non-community sources."
));

bodyChildren.push(code(
`fetch → validate → normalize → dedup → store → publish
  │         │           │         │        │        │
  │         │           │         │        │        └─► Event Bus (subscribers)
  │         │           │         │        │
  │         │           │         │        └─► Event Store (PostgreSQL + PostGIS)
  │         │           │         │
  │         │           │         └─► Dedup cache (Redis, 24h TTL)
  │         │           │
  │         │           └─► Event schema (unified)
  │         │
  │         └─► Schema validator, source-specific rules
  │
  └─► Source connector (RawObservation)`
));

bodyChildren.push(h2("2.2 Validation"));
bodyChildren.push(body(
  "Validation rejects malformed observations before they enter the normalized event stream. Validation rules " +
  "are source-specific — what is valid for NASA FIRMS is not valid for ANEPC — but follow a common pattern: " +
  "structural validation (required fields present, types correct), range validation (timestamps sane, coordinates " +
  "within Portugal's bounding box plus margin), and semantic validation (e.g., a fire with area > 100000 ha is " +
  "almost certainly a unit error)."
));

bodyChildren.push(body(
  "Validation failures are logged with full context — the raw observation, the failing rule, and the connector " +
  "that produced it — so the team can diagnose whether the failure is a source bug, a parser bug, or a genuine " +
  "data quality issue. Failed observations are not silently dropped; they are quarantined for review."
));

bodyChildren.push(h2("2.3 Normalization"));
bodyChildren.push(body(
  "Normalization converts a validated RawObservation into an Event in the unified schema. This is where source-" +
  "specific knowledge is applied: NASA FIRMS confidence values are mapped to the platform's 0-1 scale; ANEPC " +
  "bulletin free-text is parsed for status, area, and location; community report photos are processed for " +
  "EXIF stripping and content classification."
));

bodyChildren.push(body(
  "Normalization logic is versioned and auditable. When the logic changes — say, a better parser for ANEPC " +
  "bulletins — the version is incremented, and the new logic is applied only to new observations. Historical " +
  "events retain the normalization version under which they were processed. This allows the team to re-process " +
  "historical data if needed, without losing the audit trail."
));

bodyChildren.push(h2("2.4 Deduplication"));
bodyChildren.push(body(
  "Some sources republish observations. NASA FIRMS, for example, may emit multiple detections for the same " +
  "hotspot as the satellite passes over. ANEPC bulletins may be republished with minor edits. Without " +
  "deduplication, these republishings would create duplicate events, polluting the incident aggregation."
));

bodyChildren.push(body(
  "Deduplication uses a composite key: source + sourceInternalId for sources with stable identifiers; for " +
  "sources without stable identifiers, a hash of (source, observedAt, geometry, key payload fields) is used. " +
  "The dedup cache has a 24-hour TTL — long enough to catch most republishings, short enough to allow legitimate " +
  "re-observations (a fire that flares up again after 25 hours is not a duplicate)."
));

bodyChildren.push(h2("2.5 Storage"));
bodyChildren.push(body(
  "Events are stored in PostgreSQL with the PostGIS spatial extension. The events table is partitioned by " +
  "observed_at month, which keeps individual partitions small enough for efficient vacuuming and archival. " +
  "Spatial indexing uses GIST; temporal indexing uses B-tree. The schema is described in detail in the Event " +
  "Model Spec."
));

bodyChildren.push(h2("2.6 Publishing"));
bodyChildren.push(body(
  "After storage, the event is published to the event bus. Publication is atomic with storage — if storage " +
  "succeeds, publication happens; if storage fails, publication does not happen. This ordering ensures that " +
  "subscribers never see an event that is not also in the event store, which simplifies downstream consistency."
));

bodyChildren.push(body(
  "The event bus is Redis Streams, chosen for its persistence, consumer groups, and at-least-once delivery " +
  "semantics. Subscribers are responsible for idempotency; the event ID is the natural idempotency key. The " +
  "bus is not a long-term store — events are retained for 7 days, after which subscribers must rely on the " +
  "event store for historical data."
));

// ============ 3. SOURCE INVENTORY ============
bodyChildren.push(h1("3. Source Inventory"));

bodyChildren.push(h2("3.1 Inventory Overview"));
bodyChildren.push(body(
  "The table below summarizes the eight sources in scope for Phases 1 through 4. Each source has a dedicated " +
  "section (3.2 through 3.9) with full details. The status column reflects the current integration state; " +
  "sources marked \"Confirmed\" have verified access; \"Pending\" sources require institutional negotiation; " +
  "\"Planned\" sources are scoped but not yet started."
));

bodyChildren.push(tableTitle("Table 3.1: Source Inventory Summary"));
bodyChildren.push(dataTable(
  ["Source", "Type", "Phase", "Cadence", "Status"],
  [
    ["NASA FIRMS", "Satellite", "1", "~15 min (overpass)", "Confirmed (public API)"],
    ["ANEPC", "Official", "1", "Variable (event-driven)", "Pending (negotiation required)"],
    ["IPMA", "Weather", "1", "Hourly", "Confirmed (public API)"],
    ["ICNF", "Official (forestry)", "1", "Daily / event-driven", "Pending (license review)"],
    ["DGT", "Geographic", "1", "Quarterly (boundaries)", "Confirmed (CC-BY)"],
    ["SGIFR", "Official (rural)", "1", "Variable", "Pending (access uncertain)"],
    ["News (multi-publisher)", "News", "4", "Continuous", "Confirmed (RSS + scraping)"],
    ["Community Reports", "Community", "2", "Real-time (burst)", "Planned (platform-generated)"],
  ],
  { colWidths: [26, 18, 8, 26, 22] }
));

bodyChildren.push(h2("3.2 NASA FIRMS"));

bodyChildren.push(h3("3.2.1 Overview"));
bodyChildren.push(body(
  "NASA Fire Information for Resource Management System (FIRMS) is the platform's primary satellite-based " +
  "wildfire detection source. It distributes Near Real-Time (NRT) active fire data from the MODIS and VIIRS " +
  "instruments aboard NASA's Terra, Aqua, Suomi NPP, and NOAA-20 satellites. The data is global, freely " +
  "available, and published with minimal delay after each satellite overpass."
));

bodyChildren.push(body(
  "NASA FIRMS is the cornerstone of the citizen MVP because it provides the only detection source that does " +
  "not require institutional negotiation. It is not perfect — it misses small fires, has limited revisit time, " +
  "and cannot distinguish wildfires from controlled burns — but it is reliable, transparent, and immediately " +
  "available. The platform treats FIRMS detections as the floor of its detection capability, with official and " +
  "community sources layered on top."
));

bodyChildren.push(h3("3.2.2 Data Format"));
bodyChildren.push(body(
  "FIRMS distributes data in multiple formats: CSV, GeoJSON, Shapefile, and WMS. The Ember connector uses " +
  "the GeoJSON feed for its native spatial structure. Each feature represents one active fire detection and " +
  "includes the satellite, instrument, acquisition time, confidence value, and fire radiative power (FRP)."
));

bodyChildren.push(tableTitle("Table 3.2: NASA FIRMS Key Fields"));
bodyChildren.push(dataTable(
  ["Field", "Type", "Description", "Platform Mapping"],
  [
    ["latitude", "float", "Detection centroid latitude", "geometry.coordinates[1]"],
    ["longitude", "float", "Detection centroid longitude", "geometry.coordinates[0]"],
    ["acq_date", "date", "Acquisition date", "observed_at (date portion)"],
    ["acq_time", "time", "Acquisition time (UTC)", "observed_at (time portion)"],
    ["satellite", "string", "Terra, Aqua, NPP, NOAA-20", "properties.satellite"],
    ["instrument", "string", "MODIS or VIIRS", "properties.instrument"],
    ["confidence", "string (MODIS) / int (VIIRS)", "Detection confidence", "trust.confidence (after normalization)"],
    ["frp", "float", "Fire Radiative Power (MW)", "properties.frp"],
    ["bright_ti4", "float", "Brightness temperature I-4 band", "properties.brightness"],
    ["scan", "float", "Scan resolution (km)", "properties.scan_resolution"],
    ["track", "float", "Track resolution (km)", "properties.track_resolution"],
  ],
  { colWidths: [18, 22, 32, 28] }
));

bodyChildren.push(h3("3.2.3 Access Mechanism"));
bodyChildren.push(body(
  "FIRMS offers two access patterns. The first is the static archive, downloadable as global CSV or Shapefile, " +
  "updated daily. The second is the FIRMS API, which provides filtered access to recent detections (typically " +
  "the last 24 to 48 hours) via HTTP requests. The Ember connector uses the API for real-time data and the " +
  "archive for historical backfill."
));

bodyChildren.push(body(
  "The API requires a MAP_KEY, which is free but must be requested from NASA. The connector authenticates " +
  "with this key in the query string of each request. Rate limits are not strictly documented but the platform " +
  "respects a self-imposed limit of one request per minute per region of interest, which is well within the " +
  "FIRMS team's expectations for polite use."
));

bodyChildren.push(code(
`// NASA FIRMS API request example
// Endpoint: https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{SOURCE}/{AREA}/{DAY_RANGE}

GET https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/VIIRS_SNPP_NRT/-12,36,-6,44/1

// Returns CSV with the fields listed in Table 3.2
// AREA is West,South,East,North bounding box
// Portugal bounding box: approximately -12,36,-6,44`
));

bodyChildren.push(h3("3.2.4 Cadence and Revisit Time"));
bodyChildren.push(body(
  "FIRMS publishes new detections approximately every 15 minutes during satellite overpasses. Each satellite " +
  "(Terra, Aqua, Suomi NPP, NOAA-20) overpasses Portugal 2-4 times per day, with the exact timing depending " +
  "on latitude and season. The combined constellation provides roughly 6-12 overpasses per day for mainland " +
  "Portugal, meaning a fire may be detected within minutes of starting (if it starts just before an overpass) " +
  "or up to several hours later (if it starts just after one)."
));

bodyChildren.push(body(
  "This cadence is the platform's primary detection constraint. Citizens cannot rely on FIRMS alone for real-" +
  "time awareness of a fire that just started — community reports and official bulletins fill that gap. The " +
  "platform communicates this honestly: FIRMS detections are labeled \"satellite detection\" with the " +
  "acquisition time, never presented as real-time ground truth."
));

bodyChildren.push(h3("3.2.5 Confidence Mapping"));
bodyChildren.push(body(
  "MODIS confidence is a string (low / nominal / high), while VIIRS confidence is an integer (0-100). The " +
  "connector normalizes both to the platform's 0-1 scale: MODIS maps low to 0.3, nominal to 0.6, high to " +
  "0.9; VIIRS is divided by 100. These normalized values become the source-provided confidence input to the " +
  "trust engine; the engine may adjust them based on corroboration and freshness."
));

bodyChildren.push(h3("3.2.6 Limitations and Known Issues"));
bodyChildren.push(body(
  "FIRMS has several known limitations the platform must communicate honestly. First, it cannot distinguish " +
  "wildfires from controlled agricultural burns, which are common in Portugal during spring and autumn. The " +
  "platform uses ICNF's controlled burn registry (where available) to filter or flag these. Second, it misses " +
  "small fires — MODIS requires approximately 100 square meters of active flaming to detect, and VIIRS " +
  "requires somewhat less. Third, cloud cover obscures detections entirely; a fire burning under thick clouds " +
  "will not appear until the next clear-sky overpass."
));

bodyChildren.push(body(
  "These limitations do not diminish FIRMS's value, but they shape how the platform presents its data. A FIRMS " +
  "detection is evidence that a fire exists; the absence of a FIRMS detection is not evidence that no fire " +
  "exists. The UI communicates this asymmetry through labeling and the trust envelope."
));

bodyChildren.push(h2("3.3 ANEPC (Autoridade Nacional de Emergência e Proteção Civil)"));

bodyChildren.push(h3("3.3.1 Overview"));
bodyChildren.push(body(
  "ANEPC is Portugal's National Authority for Emergency and Civil Protection. It is the authoritative source " +
  "for wildfire status, deployment of resources, and official communications during fire events. ANEPC data " +
  "is the platform's most valuable official source — when ANEPC says a fire is contained, that is the " +
  "official truth."
));

bodyChildren.push(body(
  "The challenge with ANEPC is access. Unlike NASA FIRMS, ANEPC does not operate a public structured-data " +
  "API for wildfire events. Information flows through press releases, social media (notably the official " +
  "Twitter/X account @ProtecaoCivil), the Fogos.pt platform (which itself sources from ANEPC), and direct " +
  "institutional channels. The platform's Phase 0 must negotiate structured access; until that negotiation " +
  "succeeds, the connector operates against public sources with degraded capability."
));

bodyChildren.push(h3("3.3.2 Data Sources Within ANEPC"));
bodyChildren.push(body(
  "ANEPC publishes wildfire information through several channels, each with different reliability and structure:"
));

bodyChildren.push(tableTitle("Table 3.3: ANEPC Publication Channels"));
bodyChildren.push(dataTable(
  ["Channel", "Format", "Cadence", "Structured?"],
  [
    ["Official press releases (protecaocivil.pt)", "HTML", "Per major event", "No (free text)"],
    ["Twitter/X @ProtecaoCivil", "Social media", "Per event update", "No (free text)"],
    ["Fogos.pt (downstream)", "Web application", "Near real-time", "Yes (via scraping)"],
    ["Direct API (under negotiation)", "To be determined", "To be determined", "To be determined"],
    ["SGO (Sistema de Gestão de Operações)", "Internal system", "Real-time", "Not public; institutional access only"],
  ],
  { colWidths: [32, 18, 22, 28] }
));

bodyChildren.push(h3("3.3.3 Connector Strategy"));
bodyChildren.push(body(
  "The connector implements a tiered strategy. Tier 1 (always available): scrape the official press release " +
  "page and parse the Twitter feed. This provides official announcements but with significant delay and " +
  "limited structure. Tier 2 (when negotiated): use a structured-data API, if ANEPC agrees to provide one. " +
  "Tier 3 (long-term goal): direct integration with SGO, which would provide real-time operational data " +
  "including resource deployment."
));

bodyChildren.push(body(
  "The connector is designed so that adding a higher tier does not change the downstream event schema — it " +
  "only improves the data quality and freshness. This is essential for the platform's credibility: citizens " +
  "and professionals who build workflows around Ember data must not have those workflows disrupted when the " +
  "platform gains access to better ANEPC data."
));

bodyChildren.push(h3("3.3.4 Parsing Strategy"));
bodyChildren.push(body(
  "ANEPC press releases are Portuguese free text with semi-structured elements: location references (concelho, " +
  "freguesia, place names), timestamps, status indicators (\"ativado\", \"em curso\", \"extinto\", " +
  "\"concluído\"), and resource counts (\"meios humanos\", \"meios aéreos\"). The connector uses a combination " +
  "of regex extraction and NLP to parse these into structured fields."
));

bodyChildren.push(body(
  "Parsing is not reliable enough to be the sole signal. The connector attaches a parse confidence to each " +
  "field, and the trust engine treats low-confidence parses as unverified until corroborated by another source. " +
  "Where parsing fails entirely, the raw text is preserved in the event's properties and surfaced to users as " +
  "\"official statement\" without structured extraction."
));

bodyChildren.push(h3("3.3.5 Licensing and Attribution"));
bodyChildren.push(body(
  "ANEPC's public communications are subject to Portuguese copyright law and the regime de reutilização de " +
  "informação (Decree-Law 192/2009, transposing EU Directive 2003/98/EC). Public sector information can " +
  "generally be reused for commercial purposes with attribution, but specific conditions may apply. The " +
  "platform's Phase 0 legal review must confirm the terms under which ANEPC data can be redistributed and " +
  "incorporated into a commercial product (the professional tier)."
));

bodyChildren.push(calloutBox(
  "Assumption Pending Confirmation",
  "Until institutional negotiation confirms otherwise, the platform operates under the assumption that " +
  "redistributing ANEPC's public communications with attribution is permitted under the EU PSI directive. " +
  "The fallback if this assumption is wrong is to display ANEPC information as embedded snippets linking to " +
  "the original source, rather than as standalone structured data. This fallback degrades the professional " +
  "tier but preserves the citizen MVP."
));

bodyChildren.push(h2("3.4 IPMA (Instituto Português do Mar e da Atmosfera)"));

bodyChildren.push(h3("3.4.1 Overview"));
bodyChildren.push(body(
  "IPMA is Portugal's meteorological authority. The platform uses IPMA data for two purposes: current weather " +
  "observations (temperature, humidity, wind) that contextualize fire risk, and the official fire risk index " +
  "(Índice de Risco de Incêndio) that ANEPC and ICNF use to inform prevention and response decisions. IPMA " +
  "operates a public API with reasonable terms of use."
));

bodyChildren.push(h3("3.4.2 Data Products"));
bodyChildren.push(body(
  "IPMA publishes several relevant data products. The observations API provides near-real-time measurements " +
  "from surface weather stations across mainland Portugal and the islands. The forecast API provides " +
  "location-specific forecasts for the next several days. The fire risk API publishes the daily fire risk " +
  "index for each mainland municipality, derived from temperature, humidity, wind, and recent precipitation."
));

bodyChildren.push(tableTitle("Table 3.4: IPMA Data Products Used"));
bodyChildren.push(dataTable(
  ["Product", "Endpoint", "Cadence", "Purpose"],
  [
    ["Surface observations", "/open-data/observacao/meteorologia", "Hourly", "Wind, humidity, temperature on incident detail"],
    ["Location forecast", "/api/ipma/portugal", "Twice daily", "Risk projection on incident detail"],
    ["Fire risk index", "/open-data/previsao/risco-incendio", "Daily (morning)", "Risk layer on map; alert triggers"],
    ["UV index", "/open-data/previsao/uv", "Daily", "Operator safety context (Phase 7)"],
  ],
  { colWidths: [26, 30, 18, 26] }
));

bodyChildren.push(h3("3.4.3 Access Mechanism"));
bodyChildren.push(body(
  "IPMA's open data portal (https://ipma.pt/open-data) provides JSON and XML endpoints free of charge. No API " +
  "key is required for most endpoints, though the platform identifies itself via User-Agent and respects " +
  "reasonable rate limits (the connector polls once per minute for observations, once per hour for forecasts). " +
  "Attribution is required and displayed in the platform's footer and on weather panels."
));

bodyChildren.push(h3("3.4.4 Fire Risk Index"));
bodyChildren.push(body(
  "IPMA's fire risk index is the official Portuguese fire risk measure. It is published daily for each mainland " +
  "municipality, on a five-level scale: Reduced (Reduzido), Moderate (Moderado), High (Elevado), Very High " +
  "(Muito Elevado), Maximum (Máximo). The platform renders this as a choropleth layer on the citizen map and " +
  "uses it as an input to alert logic (a new incident in a Maximum risk zone triggers higher-priority " +
  "notifications than the same incident in a Reduced risk zone)."
));

bodyChildren.push(h2("3.5 ICNF (Instituto da Conservação da Natureza e das Florestas)"));

bodyChildren.push(h3("3.5.1 Overview"));
bodyChildren.push(body(
  "ICNF is Portugal's nature and forest conservation institute. The platform uses ICNF data for three purposes: " +
  "the annual wildfire statistics report (ICNF's historical fire atlas), the controlled burn registry (which " +
  "helps disambiguate FIRMS detections), and the forest fuel load maps that inform prevention planning. ICNF " +
  "data is high-value but published with significant delay — annual statistics may lag the fire season by " +
  "months."
));

bodyChildren.push(h3("3.5.2 Data Products"));
bodyChildren.push(tableTitle("Table 3.5: ICNF Data Products Used"));
bodyChildren.push(dataTable(
  ["Product", "Format", "Cadence", "Purpose"],
  [
    ["Wildfire atlas (historical)", "Shapefile / CSV", "Annual (with delay)", "Historical analysis (Phase 5)"],
    ["Controlled burn registry", "PDF / structured (TBC)", "Permit-issued", "FIRMS false-positive filter"],
    ["Forest fuel load map", "Raster (GeoTIFF)", "Annual", "Prevention priority maps (Phase 5)"],
    ["Forest type map (COS)", "Vector", "Annual", "Asset layer for pro dashboard"],
    ["Burned area registry", "Vector", "Per major event", "Post-incident analysis"],
  ],
  { colWidths: [28, 24, 22, 26] }
));

bodyChildren.push(h3("3.5.3 Access and Licensing"));
bodyChildren.push(body(
  "ICNF publishes much of its data through the ICNF geoportal and the SNIG (Sistema Nacional de Informação " +
  "Geográfica) portal operated by DGT. Licensing varies by dataset — some is CC-BY, some is restricted to " +
  "non-commercial use, and some requires direct negotiation. The Phase 0 legal review must confirm licensing " +
  "for each dataset the platform intends to use."
));

bodyChildren.push(h2("3.6 DGT (Direção-Geral do Território)"));

bodyChildren.push(h3("3.6.1 Overview"));
bodyChildren.push(body(
  "DGT operates SNIG, Portugal's national geographic information infrastructure. The platform uses DGT data " +
  "primarily for administrative boundaries (municipalities, parishes, districts) and base cartography. This " +
  "data is the reference layer for geo enrichment — every event's coordinates are reverse-geocoded to a " +
  "municipality and parish using DGT boundaries."
));

bodyChildren.push(h3("3.6.2 Boundary Datasets"));
bodyChildren.push(tableTitle("Table 3.6: DGT Boundary Datasets"));
bodyChildren.push(dataTable(
  ["Dataset", "Scale", "Update Cadence", "License"],
  [
    ["Administrative units (CAOP)", "1:25,000", "Annual", "CC-BY 4.0"],
    ["Parish boundaries (BGRI)", "1:25,000", "Per census", "CC-BY 4.0"],
    ["Road network (OpenStreetMap-derived)", "Variable", "Continuous", "ODbL"],
    ["Land cover (COS)", "1:25,000", "Annual", "CC-BY 4.0"],
    ["Orthophotography", "Variable", "Cyclic (3-5 years)", "CC-BY 4.0"],
  ],
  { colWidths: [32, 18, 22, 28] }
));

bodyChildren.push(h3("3.6.3 Connector Strategy"));
bodyChildren.push(body(
  "DGT data is largely static (boundaries change annually at most) and is loaded into the platform's spatial " +
  "database at deployment time, with quarterly refresh checks. The connector is therefore minimal: it polls " +
  "the SNIG portal for updated versions, downloads changed datasets, and applies them as database migrations. " +
  "There is no real-time component."
));

bodyChildren.push(h2("3.7 SGIFR (Sistema de Gestão Integrada de Fogos Rurais)"));

bodyChildren.push(h3("3.7.1 Overview and Status"));
bodyChildren.push(body(
  "SGIFR is ICNF's integrated rural fire management system. It is the operational system used by ICNF and " +
  "ANEPC during fire events and contains the most detailed official data on rural fires in Portugal. Access " +
  "is restricted to authorized institutional users; the platform cannot integrate SGIFR without explicit " +
  "institutional agreement."
));

bodyChildren.push(body(
  "This source is listed for completeness but is marked \"Pending — access uncertain.\" If access cannot be " +
  "negotiated, the platform's official data comes from ANEPC public communications and ICNF's published " +
  "statistics. The architecture does not depend on SGIFR for any Phase 1 feature; SGIFR would significantly " +
  "improve Phase 3 (institutional intelligence) and Phase 7 (professional platform) if access is granted."
));

bodyChildren.push(h2("3.8 News (Multi-Publisher)"));

bodyChildren.push(h3("3.8.1 Overview"));
bodyChildren.push(body(
  "News articles provide narrative context that official sources lack: human-interest stories, evacuation " +
  "details, political reactions, cause speculation. They are also a source of early detection — a local news " +
  "outlet may report a fire before ANEPC issues a bulletin. The news connector ingests articles from multiple " +
  "publishers, filters for wildfire relevance, geolocates them, and integrates them into the incident timeline."
));

bodyChildren.push(h3("3.8.2 Source Publishers"));
bodyChildren.push(tableTitle("Table 3.7: News Publishers (Initial Set)"));
bodyChildren.push(dataTable(
  ["Publisher", "Access Method", "Relevance Filter", "License"],
  [
    ["RTP Notícias", "RSS", "Keyword + geolocation", "Snippets + link (fair use)"],
    ["Público", "RSS", "Keyword + geolocation", "Snippets + link (fair use)"],
    ["Expresso", "RSS", "Keyword + geolocation", "Snippets + link (fair use)"],
    ["Jornal de Notícias", "RSS", "Keyword + geolocation", "Snippets + link (fair use)"],
    ["Correio da Manhã", "RSS", "Keyword + geolocation", "Snippets + link (fair use)"],
    ["Lusa (agency)", "RSS (where available)", "Keyword + geolocation", "Licensed separately if used commercially"],
    ["Local newspapers (per region)", "RSS / scraping", "Keyword + geolocation", "Snippets + link (fair use)"],
  ],
  { colWidths: [26, 22, 28, 24] }
));

bodyChildren.push(h3("3.8.3 Processing Pipeline"));
bodyChildren.push(body(
  "News ingestion is a multi-stage pipeline. The connector fetches RSS feeds at 5-minute intervals, filters " +
  "for wildfire-related keywords (\"incêndio\", \"fogo\", \"fogos\", \"combate a incêndios\", and " +
  "compounds), and passes candidates to the NLP pipeline. The NLP pipeline performs geolocation extraction " +
  "(identifying place names and mapping them to coordinates), duplicate detection (the same story may be " +
  "syndicated across multiple publishers), and relevance scoring (a brief mention vs. a detailed report)."
));

bodyChildren.push(body(
  "Successfully processed articles become Events of type \"news\" and are attached to the relevant Incident's " +
  "timeline. The platform displays the article headline, a short snippet, the publisher, the publication time, " +
  "and a link to the full article. Full article text is never republished — the platform respects copyright " +
  "by linking rather than reproducing."
));

bodyChildren.push(h2("3.9 Community Reports"));

bodyChildren.push(h3("3.9.1 Overview"));
bodyChildren.push(body(
  "Community reports are the platform's only user-generated data source. Unlike external sources, the platform " +
  "controls the schema, the cadence, and the quality — but also bears the moderation burden. Community reports " +
  "are a Phase 2 feature; they are listed here for completeness, with full design in the community layer " +
  "specification (a separate document)."
));

bodyChildren.push(h3("3.9.2 Report Types"));
bodyChildren.push(tableTitle("Table 3.8: Community Report Types"));
bodyChildren.push(dataTable(
  ["Type", "Description", "Trust Tier", "Moderation"],
  [
    ["Smoke sighting", "User reports visible smoke, no flame", "Low (0.4)", "Auto + queue"],
    ["Flame sighting", "User reports visible flame", "Medium (0.5)", "Auto + queue"],
    ["Road closure", "User reports closed road due to fire", "Medium (0.6)", "Auto + queue"],
    ["Evacuation notice", "User reports evacuation in their area", "High (0.8)", "Manual review required"],
    ["Controlled burn", "User reports a controlled agricultural burn", "High (0.8)", "Auto-confirm if matches ICNF registry"],
    ["Contained confirmation", "User reports fire appears contained", "Medium (0.6)", "Auto + queue"],
  ],
  { colWidths: [22, 38, 18, 22] }
));

bodyChildren.push(h3("3.9.3 Trust and Moderation"));
bodyChildren.push(body(
  "Community reports feed into the trust engine with source_type = 'community' and a base confidence derived " +
  "from the reporter's reputation. The moderation queue uses a tiered SLA: evacuation notices are reviewed " +
  "within 5 minutes during fire season; other reports within 1 hour. Reports that fail automated checks " +
  "(anomalous location, suspicious account characteristics) are escalated to manual review regardless of type."
));

// ============ 4. CROSS-CUTTING CONCERNS ============
bodyChildren.push(h1("4. Cross-Cutting Concerns"));

bodyChildren.push(h2("4.1 Geo Enrichment"));
bodyChildren.push(body(
  "Every event with a geometry is enriched with administrative context: municipality, parish, district, " +
  "nearest road, forest zone, and IPMA fire risk zone. This enrichment is performed once at ingestion time " +
  "and stored on the event; it is not recomputed on read. The enrichment pipeline uses DGT boundary data " +
  "(see Section 3.6) and is implemented as PostGIS spatial joins."
));

bodyChildren.push(code(
`-- Geo enrichment SQL (simplified)
UPDATE events e
SET geo_enrichment = jsonb_build_object(
  'municipality', m.nome,
  'parish', p.nome,
  'district', d.nome,
  'risk_zone', r.risk_level,
  'nearest_road_50m', road.name
)
FROM municipalities m, parishes p, districts d, risk_zones r, roads road
WHERE ST_Contains(m.geom, e.geometry)
  AND ST_Contains(p.geom, e.geometry)
  AND ST_Contains(d.geom, e.geometry)
  AND ST_Contains(r.geom, e.geometry)
  AND ST_DWithin(road.geom, e.geometry, 50)
  AND e.geo_enrichment IS NULL;`
));

bodyChildren.push(h2("4.2 Source-Specific Trust Inputs"));
bodyChildren.push(body(
  "Each source contributes trust inputs differently. The table below summarizes how the trust engine treats " +
  "each source type. These values are initial defaults; they are tuned over time based on observed accuracy."
));

bodyChildren.push(tableTitle("Table 4.1: Source-Specific Trust Inputs"));
bodyChildren.push(dataTable(
  ["Source", "Base Confidence", "Reputation Weight", "Notes"],
  [
    ["NASA FIRMS", "0.3-0.9 (from source confidence)", "0.4", "High reputation; misses small fires"],
    ["ANEPC (official)", "0.9", "0.5", "Authoritative when available"],
    ["IPMA weather", "0.95", "0.5", "Highly reliable; not used for fire detection"],
    ["ICNF (forestry)", "0.85", "0.5", "Authoritative for fuel load, historical"],
    ["News", "0.5-0.7", "0.3", "Per-publisher; degrades with correction rate"],
    ["Community", "0.3-0.9 (per reporter tier)", "0.2-0.4", "Highly variable; reputation-driven"],
  ],
  { colWidths: [22, 22, 18, 38] }
));

bodyChildren.push(h2("4.3 Source Attribution"));
bodyChildren.push(body(
  "Every event displayed on the platform carries visible source attribution. The attribution is not just a " +
  "label — it is a hyperlink to the source (where possible) and a tooltip explaining the source's role and " +
  "limitations. This transparency is a core trust mechanic; users who understand where information comes from " +
  "are better equipped to evaluate it."
));

bodyChildren.push(body(
  "For aggregated views (an Incident combining events from multiple sources), the platform shows a source " +
  "summary: \"NASA FIRMS + ANEPC + 3 community reports.\" This lets the user see at a glance how diverse " +
  "the corroboration is, which is itself a trust signal."
));

bodyChildren.push(h2("4.4 Data Retention Per Source"));
bodyChildren.push(body(
  "Retention policies vary by source type, balancing historical value against storage cost and privacy " +
  "obligations. Official and satellite data is retained indefinitely (it is public record). News articles " +
  "are retained indefinitely but with full-text replaced by snippets after 90 days. Community reports are " +
  "retained for 90 days by default, with longer retention only with explicit user consent."
));

bodyChildren.push(h1("5. Conclusion"));

bodyChildren.push(body(
  "This inventory represents the platform's best understanding of its data landscape at the time of writing. " +
  "It will evolve — sources will be added, licensing terms will change, new official APIs will become available. " +
  "The connector architecture is designed to absorb these changes without disrupting the platform: each source " +
  "is isolated, each connector implements a uniform interface, and the trust engine provides a consistent " +
  "framework for evaluating source reliability."
));

bodyChildren.push(body(
  "The most significant risk to the platform's data foundation is institutional: ANEPC structured access is " +
  "not yet confirmed, and without it the platform's official data is degraded. The team's Phase 0 priority " +
  "is therefore not technical but institutional — building the relationships that will unlock structured " +
  "official data. The technical architecture is ready; the institutional work is the gating item."
));

bodyChildren.push(body(
  "The connector specifications in this document are detailed enough to begin implementation of the confirmed " +
  "sources (NASA FIRMS, IPMA, DGT) immediately. The pending sources (ANEPC, ICNF, SGIFR) have fallback " +
  "strategies that allow the citizen MVP to launch even if institutional negotiations extend beyond Phase 0. " +
  "This is the discipline of a platform that ships while it negotiates, but never ships without a plan for " +
  "what it cannot yet integrate."
));

// === Build document ===
const coverConfig = {
  title: "Data Source Inventory & Connector Spec",
  subtitle: "Ember Platform — Connector Architecture and Per-Source Specifications",
  englishLabel: "DATA SOURCE INVENTORY",
  metaLines: [
    "Document Type:  Data Engineering Reference",
    "Version:  1.0  (Initial Release)",
    "Status:  Draft for Collaborator Review",
    "Date:  July 2026",
    "Codename:  Ember",
  ],
  footerLeft: "Ember Platform — Data Source Inventory",
  footerRight: "Confidential — Internal",
};

const doc = buildDocument({
  coverConfig,
  bodyChildren,
  headerTitle: "Ember — Data Source Inventory",
});

doc.numbering.config = numberingConfigs;

const outputPath = "/home/z/my-project/download/Ember-Data-Source-Inventory.docx";
U.docx.Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(outputPath, buf);
  console.log(`✓ Data Source Inventory DOCX written: ${outputPath}`);
  console.log(`  Size: ${(buf.length / 1024).toFixed(1)} KB`);
}).catch(err => {
  console.error("✗ Generation failed:", err);
  process.exit(1);
});
