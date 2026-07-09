// Architecture Foundations Document — Ember Platform
const fs = require("fs");
const path = require("path");
const U = require("./docx-utils");
const { h1, h2, h3, body, bodyMixed, bullet, numbered, code,
        tableTitle, tableCaption, dataTable, spacer, calloutBox,
        buildDocument, PB } = U;
const { TextRun, Paragraph, PageBreak, AlignmentType, HeadingLevel,
        LevelFormat, TableOfContents } = U.docx;

// Numbering configs for lists across the document
const numberingConfigs = [];
["lst-foundations", "lst-trust", "lst-roadmap", "lst-risks", "lst-observability",
 "lst-legal", "lst-event", "lst-deployment"].forEach((ref, i) => {
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

bodyChildren.push(new Paragraph({
  children: [new PageBreak()],
}));

// ============ EXECUTIVE SUMMARY ============
bodyChildren.push(h1("Executive Summary"));

bodyChildren.push(body(
  "Ember is a long-horizon platform ambition: build Europe's trusted real-time public safety intelligence layer, " +
  "starting with Portuguese wildfires and expanding hazard-by-hazard, country-by-country. The platform is not a single " +
  "application; it is an ecosystem of products (citizen map, professional dashboard, prevention tools), data connectors " +
  "(official sources, satellite feeds, news, community reports), and intelligence engines (trust scoring, AI summarization, " +
  "geospatial enrichment) that share a common substrate."
));

bodyChildren.push(body(
  "This document defines the architectural foundations that make that ecosystem possible. It is deliberately written " +
  "with the assumption that the reader will onboard collaborators, brief institutional partners, and make build-vs-buy " +
  "decisions under it. It is therefore heavier on rationale and contract definition than on implementation code. " +
  "Implementation choices are recorded where they are load-bearing; elsewhere, the document specifies the constraints " +
  "any conforming implementation must satisfy."
));

bodyChildren.push(body(
  "The structure of the document follows the three-roadmap discipline the project has adopted. The Product Roadmap " +
  "describes what users see. The Engineering Roadmap describes how the platform is built. The Data Roadmap describes " +
  "what the platform knows. Two additional tracks — Observability & Reliability and Legal & Compliance — are presented " +
  "as first-class concerns rather than afterthoughts, because on a public safety platform a missing connector alert " +
  "or a GDPR violation are not engineering inconveniences; they are failures of mission."
));

bodyChildren.push(body(
  "A central architectural commitment is the Trust Engine. Every observable item on the platform — an incident, a " +
  "satellite hotspot, a community report, an official bulletin — carries a trust envelope that records its source, " +
  "verification status, confidence, freshness, and corroboration. Trust is not a data-team concern; it is a platform " +
  "primitive consumed by the map engine (for styling), the notification engine (for gating), the AI engine (as an " +
  "input feature), and the professional dashboard (for prioritization). Promoting trust to a cross-cutting engine is " +
  "the single architectural decision that most distinguishes Ember from existing fire maps."
));

bodyChildren.push(body(
  "Finally, the document records the event model at the heart of the platform. The atom is the Event: an immutable " +
  "observation with provenance, geo, and trust. The aggregate is the Incident: a cluster of Events that the platform " +
  "treats as a single evolving entity. Getting this hierarchy right at the schema level — and refusing to flatten it " +
  "into a single \"fire\" table — is what will allow Ember to grow from a live map into a prevention platform without " +
  "a re-architecture."
));

// ============ 1. INTRODUCTION ============
bodyChildren.push(h1("1. Introduction"));

bodyChildren.push(h2("1.1 Purpose of This Document"));
bodyChildren.push(body(
  "This document is the architectural foundations reference for the Ember platform. Its audience includes: (a) engineering " +
  "collaborators joining the project; (b) institutional partners (ANEPC, IPMA, municipalities) evaluating the platform's " +
  "seriousness; (c) commercial customers (utilities, forestry companies, insurers) assessing integration feasibility; " +
  "and (d) the founding team itself, as a durable record of decisions and their rationale."
));

bodyChildren.push(body(
  "The document is not a product specification, a UI design brief, or a release plan. Those exist separately. " +
  "What this document provides is the architectural spine on which all of those rest: the roadmaps, the engine " +
  "decomposition, the trust model, the event model, and the cross-cutting concerns that determine whether the " +
  "platform scales gracefully or collapses under its own weight."
));

bodyChildren.push(h2("1.2 The Ember Mission"));
bodyChildren.push(body(
  "Ember's north star is not \"show where fires are.\" Existing solutions already do that, adequately, for most " +
  "Portuguese citizens today. The north star is sharper: help people understand what is happening, what they can " +
  "trust, and how they can act safely. Each clause in that statement has architectural consequences."
));

bodyChildren.push(body(
  "\"What is happening\" requires more than a pin on a map. It requires temporal context (when did this start, " +
  "how has it evolved), spatial context (what is near, what is threatened), and narrative context (official " +
  "statements, community observations, news coverage). The platform must aggregate, not just display."
));

bodyChildren.push(body(
  "\"What they can trust\" is the hardest clause. It requires the platform to be honest about the provenance and " +
  "uncertainty of every piece of information it shows. A satellite hotspot at 30 percent confidence is not the same " +
  "as a verified civil-protection announcement, and the platform must never let the user confuse them. This is why " +
  "trust is a first-class architectural concern."
));

bodyChildren.push(body(
  "\"How they can act safely\" requires the platform to translate information into action. That means actionable " +
  "summaries, recommended behaviors, and integration with civil-protection channels. It does not mean Ember becomes " +
  "an authority — official evacuation orders always come from official channels. But Ember can ensure that when an " +
  "official order exists, the user sees it, understands it, and knows it is authoritative."
));

bodyChildren.push(h2("1.3 Scope and Out of Scope"));
bodyChildren.push(body(
  "In scope for this document: the platform's roadmap structure; the engineering engine decomposition; the data " +
  "connector architecture; the trust engine specification; the event model; the cross-cutting concerns of " +
  "observability, legal compliance, and identity."
));

bodyChildren.push(body(
  "Out of scope: detailed UI specifications, marketing strategy, commercial pricing, hiring plans, and per-source " +
  "connector contracts (which are covered in the companion Data Source Inventory & Connector Spec). Also out of " +
  "scope: a detailed incident-response runbook for the operations team, which belongs in a separate operational " +
  "documentation set."
));

bodyChildren.push(h2("1.4 Reading Guide"));
bodyChildren.push(body(
  "Readers interested in the big picture should read Sections 1 through 4. Engineers joining the project should " +
  "focus on Sections 4 through 7. Institutional partners and compliance reviewers should focus on Sections 8 " +
  "and 9. Section 10 captures the open questions the architecture does not yet resolve — these are the agenda " +
  "for the next architectural iteration."
));

// ============ 2. THE THREE-ROADMAP DISCIPLINE ============
bodyChildren.push(h1("2. The Three-Roadmap Discipline"));

bodyChildren.push(h2("2.1 Why Three Roadmaps"));
bodyChildren.push(body(
  "Most platform projects collapse their product, engineering, and data work into a single linear roadmap. This " +
  "is tempting — it looks tidy on a slide — and it is almost always wrong. The three tracks move at different " +
  "cadences, have different stakeholders, and have hard interdependencies that a linear timeline obscures. When " +
  "they are collapsed, the team optimizes for the loudest track (usually product) and quietly under-invests in " +
  "the others until a crisis forces attention."
));

bodyChildren.push(body(
  "On a public safety platform, the cost of that pattern is unacceptable. A data-connector outage during a fire " +
  "event is a life-safety issue, not a backlog item. A legal compliance gap that surfaces during a GDPR audit can " +
  "shut down the community layer for months. Engineering debt accumulated under product pressure eventually blocks " +
  "the next product phase. The three-roadmap discipline is a structural defense against these failure modes."
));

bodyChildren.push(body(
  "The discipline works as follows. Each roadmap has its own backlog, its own milestones, and its own definition " +
  "of done. Cross-roadmap dependencies are made explicit — every product feature is tagged with the engineering " +
  "and data prerequisites it depends on, and every engineering or data milestone is tagged with the product " +
  "features it unblocks. The roadmaps are reviewed together weekly, but they are not merged."
));

bodyChildren.push(h2("2.2 The Product Roadmap"));
bodyChildren.push(body(
  "The Product Roadmap describes what users see. It is organized in phases, each with a clear success metric. " +
  "Phase 0 is research and foundations. Phase 1 is the citizen MVP: a fast, clear live wildfire map that beats " +
  "existing alternatives on speed and clarity. Phase 2 adds the community layer. Phase 3 aggregates institutional " +
  "communications. Phase 4 integrates news. Phase 5 introduces prevention tools. Phase 6 brings in AI intelligence. " +
  "Phase 7 launches the professional platform. Phase 8 is the optional biomass operations extension. Phase 9 is " +
  "European expansion."
));

bodyChildren.push(body(
  "The Product Roadmap is the most visible of the three, and therefore the most susceptible to scope creep. The " +
  "discipline here is to refuse to advance to the next phase until the current phase's success metric is met. " +
  "Phase 2 (community) cannot start until Phase 1 (citizen MVP) demonstrably beats existing fire maps on the " +
  "stated metric. This is not perfectionism; it is recognition that adding community reports to a map nobody uses " +
  "yet produces noise, not value."
));

bodyChildren.push(h2("2.3 The Engineering Roadmap"));
bodyChildren.push(body(
  "The Engineering Roadmap describes how the platform is built. It is organized in phases labeled E1 through E7, " +
  "each corresponding to a major subsystem. E1 is foundation: monorepo, CI/CD, authentication, database, design " +
  "system, event architecture, logging, monitoring. E2 is the map engine. E3 is the realtime engine. E4 is the " +
  "spatial engine. E5 is the media pipeline. E6 is the notification engine. E7 is the AI pipeline."
));

bodyChildren.push(body(
  "A critical scoping decision: the E2 map engine is split into E2a (Citizen Map) and E2b (Pro Map). The citizen " +
  "map needs fast vector tiles, dark mode, clustering, and efficient setData diff updates. Globe mode, GPU " +
  "optimization, terrain rendering, and other advanced features belong in E2b and must not block the citizen MVP. " +
  "This split prevents the most common map-engine failure mode: spending six months building a beautiful globe " +
  "while citizens still have no usable map."
));

bodyChildren.push(body(
  "Similarly, E5 (media pipeline) is decoupled from E7 (AI pipeline). The media pipeline is responsible for " +
  "ingest, validation, storage, transcoding, and serving. AI features — smoke detection, sensitive content " +
  "blurring, duplicate detection — are downstream consumers. Coupling them would mean a model outage breaks " +
  "uploads, which is unacceptable."
));

bodyChildren.push(h2("2.4 The Data Roadmap"));
bodyChildren.push(body(
  "The Data Roadmap describes what the platform knows. It is the most project-specific of the three because " +
  "every data source has its own connector, its own cadence, its own format, and its own licensing terms. The " +
  "Data Roadmap defines the source connector inventory (ANEPC, IPMA, ICNF, DGT, NASA FIRMS, news, community), " +
  "the ingestion pipeline (fetch, validate, normalize, deduplicate, store, publish), the event model that " +
  "unifies all sources, the geo enrichment pipeline (coordinates to municipality, district, road, forest, risk " +
  "zone), and the trust engine that scores every event."
));

bodyChildren.push(body(
  "The companion Data Source Inventory & Connector Spec document covers the per-source details. This document " +
  "covers the cross-cutting architecture: the connector interface, the ingestion pipeline shape, the trust " +
  "engine as a platform primitive, and the geo enrichment pipeline."
));

bodyChildren.push(h2("2.5 The Two Missing Tracks"));
bodyChildren.push(body(
  "Two additional tracks are first-class concerns on Ember, not sub-items of the Engineering Roadmap. They earn " +
  "their own roadmaps because their failure modes are existential."
));

bodyChildren.push(body(
  "Observability & Reliability: for a public safety platform, the question \"is the ANEPC connector alive?\" is " +
  "a life-safety question, not a DevOps nice-to-have. The Observability & Reliability track owns per-source " +
  "freshness SLAs, connector health dashboards, alert-delivery latency tracking, and the incident-response " +
  "runbook. It is described in Section 8."
));

bodyChildren.push(body(
  "Legal & Compliance: GDPR for community reports, EU DSA liability for user content, per-source licensing " +
  "(ANEPC data has different terms from ICNF data, which has different terms again from NASA FIRMS), and the " +
  "right-to-be-forgotten for photos. Burying these concerns under \"Phase 0 foundations\" guarantees they " +
  "become a year-2 crisis. The Legal & Compliance track is described in Section 9."
));

bodyChildren.push(h2("2.6 Cross-Roadmap Dependencies"));
bodyChildren.push(body(
  "The discipline of three roadmaps only works if cross-roadmap dependencies are explicit. The table below " +
  "captures the major dependencies. Each row is a product feature; each column is a prerequisite track."
));

bodyChildren.push(tableTitle("Table 2.1: Cross-Roadmap Dependency Matrix"));
bodyChildren.push(dataTable(
  ["Product Feature", "Engineering Prereq", "Data Prereq", "Observability Prereq"],
  [
    ["Live map (Phase 1)", "E1, E2a", "ANEPC + NASA FIRMS connectors", "Connector health dashboard"],
    ["Incident details (Phase 1)", "E1, E2a", "Event model v1, geo enrichment", "Per-source freshness SLA"],
    ["Following + notifications (Phase 1)", "E1, E6", "Geofencing, user accounts", "Push delivery latency tracking"],
    ["Community reports (Phase 2)", "E1, E5, E6", "Trust engine v1, reputation system", "Moderation queue SLA"],
    ["Institutional aggregation (Phase 3)", "E3, E6", "Municipality connector, official bulletin parser", "Source freshness SLA"],
    ["News intelligence (Phase 4)", "E3, E7", "News connector, geolocation NLP", "News dedup quality metric"],
    ["Prevention tools (Phase 5)", "E2b, E4", "Historical fire data, fuel load dataset", "Data freshness dashboard"],
    ["AI summaries (Phase 6)", "E7", "Trust engine v2, event clustering", "AI quality monitoring"],
    ["Professional dashboard (Phase 7)", "E2b, E4", "Asset layers, organization data", "Multi-tenant observability"],
  ],
  { colWidths: [28, 22, 28, 22] }
));
bodyChildren.push(tableCaption("Cross-roadmap dependencies force sequencing decisions to be explicit."));

// ============ 3. PLATFORM ARCHITECTURE ============
bodyChildren.push(h1("3. Platform Architecture"));

bodyChildren.push(h2("3.1 Architectural Principles"));
bodyChildren.push(body(
  "Five principles guide every architectural decision on Ember. They are listed in priority order; when they " +
  "conflict, the earlier principle wins."
));

bodyChildren.push(numbered("Trust before speed. When a trade-off exists between showing information faster and showing it with correct provenance, the platform shows provenance. A late but correctly attributed official bulletin is more valuable than an early but misattributed rumor.", "lst-foundations", 0));
bodyChildren.push(numbered("Aggregates over atoms. The platform's primary user-facing concept is the Incident (an aggregate), not the Event (an atom). Users do not care that three satellites detected a hotspot; they care that there is a fire near them. The architecture must make aggregation first-class.", "lst-foundations", 0));
bodyChildren.push(numbered("Engines are replaceable. Every engine (map, trust, AI, notification) is a black box with a defined interface. If a better map library appears in two years, swapping it should be a contained project, not a rewrite.", "lst-foundations", 0));
bodyChildren.push(numbered("Sources are independent. No two data sources share an ingestion path. A failure in one connector must never affect another. This rules out certain \"elegant\" unified-fetcher designs that would couple source lifecycles.", "lst-foundations", 0));
bodyChildren.push(numbered("The platform is observable. Every data flow emits health, freshness, and quality metrics. If a question about platform behavior cannot be answered from dashboards, the relevant instrumentation is missing — that is a bug.", "lst-foundations", 0));

bodyChildren.push(h2("3.2 High-Level Topology"));
bodyChildren.push(body(
  "Ember is a service-oriented platform. The major subsystems communicate via well-defined interfaces, primarily " +
  "asynchronous event streams. The diagram below is a logical topology, not a deployment topology — physical " +
  "deployment may co-locate services for cost reasons, but the logical boundaries must be preserved."
));

bodyChildren.push(code(
`                          ┌──────────────────────────────────────────┐
                          │              External Sources              │
                          │  ANEPC  IPMA  ICNF  DGT  NASA  News  Users │
                          └────────────────────┬───────────────────────┘
                                                │
                          ┌─────────────────────▼──────────────────────┐
                          │            Source Connectors                │
                          │  (one per source, independent lifecycles)  │
                          └─────────────────────┬──────────────────────┘
                                                │
                          ┌─────────────────────▼──────────────────────┐
                          │            Ingestion Pipeline                │
                          │   fetch → validate → normalize → dedup      │
                          │            → store → publish                │
                          └────┬────────────┬─────────────────┬─────────┘
                                │            │                 │
                  ┌─────────────▼─┐   ┌──────▼──────┐   ┌──────▼──────────┐
                  │  Event Store   │   │  Geo Engine  │   │  Trust Engine    │
                  │  (PostgreSQL + │   │ (enrichment, │   │ (confidence,    │
                  │   PostGIS)     │   │  geofencing)  │   │  provenance)    │
                  └────────┬────────┘   └──────┬──────┘   └──────┬──────────┘
                            │                   │                 │
                          ┌─▼───────────────────▼─────────────────▼──────┐
                          │           Event Bus (publish/subscribe)        │
                          └─┬────────────┬─────────────────┬──────────────┘
                              │            │                 │
                  ┌───────────▼┐   ┌───────▼──────┐   ┌──────▼───────────┐
                  │  Map Engine  │   │ Notification │   │   AI Pipeline     │
                  │  (realtime   │   │   Engine      │   │  (clustering,     │
                  │   rendering)  │   │  (push, SSE)  │   │   summarization)  │
                  └──────┬───────┘   └──────────────┘   └───────────────────┘
                          │
                  ┌───────▼──────────────────────────────────────┐
                  │              Client Applications                │
                  │   Citizen Web (PWA)   Professional Dashboard    │
                  │   Mobile (PWA → native later)   Public API      │
                  └──────────────────────────────────────────────────┘`
));

bodyChildren.push(h2("3.3 The Packages Decomposition"));
bodyChildren.push(body(
  "Ember is structured as a monorepo with internal packages. Each package is a self-contained engine with a " +
  "defined interface. This structure allows the team to swap implementations, run targeted tests, and eventually " +
  "extract packages into standalone services if scale demands. The package layout is:"
));

bodyChildren.push(code(
`packages/
  map-engine/         # MapLibre integration, vector tiles, clustering, styling
  geo-engine/         # PostGIS queries, geofencing, reverse geocoding, polygon analysis
  event-engine/       # Event store, incident aggregation, event bus
  trust-engine/       # Confidence scoring, provenance, corroboration
  notification-engine/# Push, SSE, location triggers, alert priorities
  media-engine/       # Upload, validation, transcoding, CDN
  ai-engine/          # NLP, classification, summarization, duplicate detection
  sdk/                # Public-facing TypeScript SDK for client applications
  ui/                 # Shared design system (React components, Tailwind theme)
  config/             # Shared ESLint, TypeScript, tsconfig presets
  testing/            # Shared test utilities, fixtures, mocks`
));

bodyChildren.push(body(
  "The packages are not microservices. They are logical boundaries within a single deployable unit. The decision " +
  "to extract a package into a separately deployed service is made when, and only when, the package has independent " +
  "scaling characteristics or independent reliability requirements. Premature service extraction is one of the " +
  "most expensive mistakes a platform team can make; Ember will avoid it."
));

bodyChildren.push(h2("3.4 Technology Selection"));
bodyChildren.push(body(
  "The technology stack is chosen for maturity, ecosystem, and the ability to hire. Novelty is a cost, not a benefit, " +
  "on a public safety platform. The selections below are stable defaults; deviations require a written justification."
));

bodyChildren.push(tableTitle("Table 3.1: Technology Selection"));
bodyChildren.push(dataTable(
  ["Layer", "Choice", "Rationale"],
  [
    ["Frontend framework", "Next.js 16 + React 19", "Mature, PWA support, server components, large hiring pool"],
    ["Language", "TypeScript 5 (strict)", "Type safety is non-negotiable for a platform with this much surface area"],
    ["Map library", "MapLibre GL JS", "Open-source, vector tiles, no vendor lock-in, WebGL performance"],
    ["Styling", "Tailwind CSS 4", "Utility-first, consistent design system, small bundle"],
    ["Component library", "shadcn/ui (New York style)", "Composable, accessible, no runtime dependency lock-in"],
    ["Backend runtime", "Node.js 22 LTS (Bun for tooling)", "Unified language with frontend, mature ecosystem"],
    ["Database", "PostgreSQL 17 + PostGIS 3.4", "Best-in-class relational + spatial; no realistic alternative"],
    ["Cache", "Redis 7", "Standard, well-understood, supports pub/sub for realtime"],
    ["Object storage", "S3-compatible (Cloudflare R2 default)", "Cheap egress, durable, CDN-integrated"],
    ["Realtime", "WebSockets primary, SSE fallback", "WebSockets for bidirectional, SSE for one-way push"],
    ["Containerization", "Docker + Kubernetes (later)", "Start with single-host Docker; K8s when scale demands"],
    ["CI/CD", "GitHub Actions", "Standard, free for OSS, well-integrated"],
    ["Observability", "OpenTelemetry + Grafana stack", "Vendor-neutral, avoids lock-in"],
  ],
  { colWidths: [22, 30, 48] }
));

bodyChildren.push(h2("3.5 Deployment Topology"));
bodyChildren.push(body(
  "The deployment topology evolves with scale. In Phase 1, the entire platform runs on a single host with " +
  "Docker Compose: one container each for the Next.js app, PostgreSQL, Redis, and the ingestion workers. This " +
  "is intentionally simple — the priority is shipping the citizen MVP, not building infrastructure."
));

bodyChildren.push(body(
  "Phase 2 introduces a second host for the ingestion workers, separating the data pipeline from the user-facing " +
  "application. Phase 3 adds a CDN for static assets and media. Phase 5 introduces read replicas for PostgreSQL " +
  "as query volume grows. Phase 7, with the professional platform, justifies Kubernetes — multi-tenant isolation, " +
  "horizontal pod autoscaling, and managed database migrations become worth the operational complexity."
));

bodyChildren.push(body(
  "The cloud provider strategy is intentionally provider-agnostic. The platform runs on any major cloud (AWS, " +
  "GCP, Azure) or on bare metal. The only hard constraint is PostGIS support, which is universally available. " +
  "Default choice for Phase 1 is a single-region deployment in eu-west (Ireland or Frankfurt) for latency and " +
  "data residency reasons."
));

// ============ 4. ENGINE DECOMPOSITION ============
bodyChildren.push(h1("4. Engine Decomposition"));

bodyChildren.push(h2("4.1 The Map Engine"));
bodyChildren.push(body(
  "The Map Engine is the most visible engine on the platform and the most performance-sensitive. It is responsible " +
  "for rendering incidents, weather overlays, risk layers, and user reports on an interactive map. The engine is " +
  "split into two phases: E2a (Citizen Map) and E2b (Pro Map)."
));

bodyChildren.push(h3("4.1.1 E2a — Citizen Map"));
bodyChildren.push(body(
  "The citizen map prioritizes clarity and speed over feature density. Its success metric is whether a non-technical " +
  "user can answer the question \"is there a fire near me, and how worried should I be?\" within three seconds of " +
  "loading the page. Everything in the engine's design flows from that metric."
));

bodyChildren.push(body(
  "Rendering uses MapLibre GL JS with vector tiles served from a self-hosted tile server (initially Protomaps " +
  "static tiles, later a dynamic tile server if data volume requires). The dark mode palette is the default; " +
  "a light mode is available for accessibility. Incidents are rendered as styled circles with size proportional " +
  "to estimated area and color proportional to severity (controlled by the Trust Engine — see Section 7)."
));

bodyChildren.push(body(
  "Performance: the engine uses setData() diff updates rather than full layer replacement, Web Workers for any " +
  "non-rendering computation, and lazy loading for off-screen data. Tile caching is aggressive — the citizen map " +
  "should remain usable on a slow mobile connection. The target is 60fps panning at zoom levels 6 through 12 " +
  "(the range where most citizen interaction happens)."
));

bodyChildren.push(h3("4.1.2 E2b — Pro Map"));
bodyChildren.push(body(
  "The pro map adds globe mode, terrain rendering, satellite imagery, asset layers, and drawing tools. These " +
  "features are heavy — globe mode alone adds several hundred kilobytes to the bundle — and inappropriate for " +
  "the citizen MVP. The pro map is loaded on demand, only by professional dashboard users, and does not gate " +
  "any citizen-facing feature."
));

bodyChildren.push(h3("4.1.3 Data Flow"));
bodyChildren.push(code(
`Event Bus ──► map-engine subscription
                    │
                    ├──► filter (visible bounds, active filters)
                    ├──► cluster (supercluster for high zoom-out)
                    ├──► style (apply trust-derived color/size)
                    └──► setData() diff to MapLibre layer`
));

bodyChildren.push(h2("4.2 The Geo Engine"));
bodyChildren.push(body(
  "The Geo Engine is the platform's spatial intelligence layer. It is a thin wrapper around PostGIS with three " +
  "responsibilities: geo enrichment, geofencing, and spatial queries."
));

bodyChildren.push(body(
  "Geo enrichment takes raw coordinates and produces a structured location object: municipality, district, parish, " +
  "nearest road, forest zone, risk zone. This enrichment is performed once at ingestion time and cached on the " +
  "event; it is not recomputed on every read. The boundary datasets are sourced from DGT (Direção-Geral do " +
  "Território) and updated quarterly."
));

bodyChildren.push(body(
  "Geofencing powers the notification engine's location triggers. A user \"following\" a municipality, parish, or " +
  "custom polygon registers a geofence with the Geo Engine. When an incident intersects that geofence, the " +
  "notification engine fires. Geofence evaluation uses PostGIS ST_Intersects and is indexed with GIST for " +
  "performance."
));

bodyChildren.push(body(
  "Spatial queries support features like \"show me all incidents within 10 km of this village\" and \"show me all " +
  "incidents intersecting this road.\" These are parameterized queries against the event store, with the Geo " +
  "Engine handling index selection and query optimization."
));

bodyChildren.push(h2("4.3 The Event Engine"));
bodyChildren.push(body(
  "The Event Engine is the heart of the platform. It owns the event store, the incident aggregation logic, and " +
  "the event bus. Its design is covered in detail in Section 5; here we describe its role in the engine topology."
));

bodyChildren.push(body(
  "Every observable item — a satellite hotspot, an official bulletin, a community report, a news article, a " +
  "weather observation — enters the platform as an Event. The Event Engine normalizes these heterogeneous inputs " +
  "into a unified schema, applies deduplication, and publishes to the event bus. Aggregation logic groups " +
  "related Events into Incidents, which are the user-facing concept."
));

bodyChildren.push(body(
  "The event bus is a publish/subscribe system built on Redis Streams. Subscribers include the Map Engine (for " +
  "realtime rendering), the Notification Engine (for alert evaluation), the AI Pipeline (for clustering and " +
  "summarization), and the Trust Engine (for corroboration updates). The bus guarantees at-least-once delivery; " +
  "subscribers are responsible for idempotency."
));

bodyChildren.push(h2("4.4 The Trust Engine"));
bodyChildren.push(body(
  "The Trust Engine computes and maintains the trust envelope for every event. It is a cross-cutting engine: " +
  "every other engine consumes trust as an input. The Trust Engine is described in detail in Section 7; here " +
  "we note its topological role."
));

bodyChildren.push(body(
  "Trust is computed at ingestion time (initial score based on source reputation) and updated asynchronously " +
  "(as corroboration arrives, as the source's historical accuracy is recalculated, as community verification " +
  "accumulates). Trust updates are published to the event bus, allowing downstream engines to react. The Map " +
  "Engine re-styles an incident when its trust changes; the Notification Engine re-evaluates whether to alert; " +
  "the AI Pipeline uses trust as a feature in clustering."
));

bodyChildren.push(h2("4.5 The Notification Engine"));
bodyChildren.push(body(
  "The Notification Engine is responsible for delivering alerts to users. It subscribes to the event bus, " +
  "evaluates each event against registered geofences and follow relationships, and dispatches notifications " +
  "via the appropriate channel (push, email, in-app)."
));

bodyChildren.push(body(
  "Alert priorities are tiered. Critical alerts (imminent threat to life) bypass quiet hours and silent mode. " +
  "Standard alerts (new incident in followed area) respect user preferences. Informational alerts (status " +
  "update on followed incident) are batched and delivered at most every 30 minutes. The tiered system is " +
  "essential to prevent alert fatigue, which is the single biggest risk to a notification product."
));

bodyChildren.push(body(
  "Delivery is best-effort with retry. The engine tracks per-channel delivery latency and success rate, exposing " +
  "these metrics to the Observability stack. A silent failure in push delivery is, for a public safety platform, " +
  "a critical incident — the engine must alert on it."
));

bodyChildren.push(h2("4.6 The Media Engine"));
bodyChildren.push(body(
  "The Media Engine handles image and video uploads from community reports. Its responsibilities are: upload " +
  "validation (format, size, EXIF stripping), storage (S3-compatible), transcoding (multiple resolutions, " +
  "thumbnail generation), CDN distribution, and metadata extraction (geo, timestamp)."
));

bodyChildren.push(body(
  "AI features — smoke detection, flame classification, sensitive content blurring — are downstream consumers, " +
  "not part of the Media Engine itself. This separation is deliberate: if the AI model is unavailable, uploads " +
  "must still succeed. AI outputs are attached to media as enrichments, not gatekeeping decisions."
));

bodyChildren.push(h2("4.7 The AI Pipeline"));
bodyChildren.push(body(
  "The AI Pipeline is the slowest-evolving engine because it has the most uncertainty. Its Phase 6+ scope includes " +
  "report classification (smoke vs. flame vs. controlled burn), image analysis, duplicate detection, confidence " +
  "estimation, event clustering, and natural-language summarization. The pipeline is built as a series of " +
  "model-agnostic workers: each worker takes an event (or media item) and produces an enrichment."
));

bodyChildren.push(body(
  "Model selection is deliberately deferred. For Phase 6, the team will evaluate open-source models (Llama, " +
  "Mistral for NLP; YOLO variants for vision) and hosted APIs (OpenAI, Anthropic, Google) on a per-task basis. " +
  "The pipeline abstraction ensures that swapping a model is a contained change, not an architectural event."
));

// ============ 5. EVENT MODEL ============
bodyChildren.push(h1("5. Event Model"));

bodyChildren.push(h2("5.1 The Atom and the Aggregate"));
bodyChildren.push(body(
  "The event model is the single most important architectural decision in the platform. Get it wrong and the " +
  "platform will spend years working around the mistake. The model presented here is the result of deliberate " +
  "design; it is not the simplest possible model, but it is the simplest model that survives contact with the " +
  "platform's long-term ambitions."
));

bodyChildren.push(body(
  "The atom is the Event: an immutable observation with provenance, geo, and trust. Every piece of information " +
  "the platform handles — a NASA FIRMS hotspot detection, an ANEPC bulletin, a community smoke report, a news " +
  "article — is normalized into an Event. Events never change after creation; new observations create new Events."
));

bodyChildren.push(body(
  "The aggregate is the Incident: a cluster of Events that the platform treats as a single evolving entity. " +
  "An Incident has a lifecycle (detected, active, contained, resolved) and aggregates the Events that contribute " +
  "to it. Users interact with Incidents, not Events; the map shows Incidents, the notification engine alerts on " +
  "Incident-level changes, the professional dashboard summarizes Incidents."
));

bodyChildren.push(body(
  "This distinction is not academic. Existing fire maps typically have a single \"fire\" table that conflates " +
  "observations with the thing being observed. This works for a live map but breaks down catastrophically when " +
  "the platform tries to add features like historical analysis, multi-source aggregation, or AI summarization. " +
  "Ember refuses this conflation from day one."
));

bodyChildren.push(h2("5.2 Event Schema"));
bodyChildren.push(body(
  "The Event schema is the contract every source connector must produce. It is intentionally minimal — anything " +
  "that can be derived is derived, not stored. The full schema is defined in the companion Event Model Spec " +
  "document; the core fields are summarized here."
));

bodyChildren.push(tableTitle("Table 5.1: Event Core Schema"));
bodyChildren.push(dataTable(
  ["Field", "Type", "Description"],
  [
    ["id", "UUID", "Globally unique, assigned by the Event Engine at ingestion"],
    ["source_id", "string", "Identifier within the source (e.g., NASA FIRMS granule ID)"],
    ["source_type", "enum", "satellite / official / community / news / weather"],
    ["source_name", "string", "Human-readable source name (e.g., 'NASA FIRMS MODIS')"],
    ["observed_at", "timestamp", "When the observation was made (not when it was ingested)"],
    ["ingested_at", "timestamp", "When the Event Engine received the event"],
    ["geometry", "GeoJSON", "Point, LineString, or Polygon"],
    ["properties", "JSON", "Source-specific payload (raw data preserved)"],
    ["trust", "object", "Trust envelope (see Section 7)"],
    ["geo_enrichment", "object", "Municipality, district, parish, road, forest, risk zone"],
    ["incident_id", "UUID (nullable)", "Set by the aggregation logic; null until clustered"],
  ],
  { colWidths: [22, 22, 56] }
));

bodyChildren.push(h2("5.3 Incident Schema"));
bodyChildren.push(body(
  "The Incident schema is the user-facing aggregate. Unlike Events, Incidents are mutable — their state evolves " +
  "as new Events arrive. The Event Engine is the sole writer of Incident state; all other engines read-only."
));

bodyChildren.push(tableTitle("Table 5.2: Incident Core Schema"));
bodyChildren.push(dataTable(
  ["Field", "Type", "Description"],
  [
    ["id", "UUID", "Globally unique"],
    ["status", "enum", "detected / active / contained / resolved / monitoring"],
    ["severity", "enum", "low / medium / high / critical (derived from member Events)"],
    ["first_event_id", "UUID", "Reference to the first Event that triggered Incident creation"],
    ["latest_event_id", "UUID", "Reference to the most recent Event"],
    ["event_count", "integer", "Number of Events in the Incident"],
    ["centroid", "GeoJSON Point", "Geographic center, recomputed as the Incident evolves"],
    ["estimated_area_ha", "float", "Derived from satellite detections and official reports"],
    ["trust_summary", "object", "Aggregate trust envelope (max confidence, source diversity)"],
    ["created_at", "timestamp", "When the Incident was first created"],
    ["updated_at", "timestamp", "When the Incident was last modified"],
  ],
  { colWidths: [22, 22, 56] }
));

bodyChildren.push(h2("5.4 Aggregation Logic"));
bodyChildren.push(body(
  "Aggregation is the process by which Events become Incidents. It is one of the hardest problems in the platform " +
  "and one of the most important to get right. The naive approach — cluster Events within a fixed spatial and " +
  "temporal window — fails in practice because fire behavior is not uniform. A small agricultural fire burns " +
  "out in an hour; a major wildfire burns for weeks and migrates tens of kilometers."
));

bodyChildren.push(body(
  "Ember's aggregation logic is multi-strategy. The primary strategy is spatial-temporal clustering: Events " +
  "within 5 km and 6 hours of each other are candidates for the same Incident. The secondary strategy is " +
  "official binding: when an official source (ANEPC) issues a bulletin referencing a known incident, that " +
  "binding overrides the spatial-temporal logic. The tertiary strategy is AI-assisted clustering (Phase 6+), " +
  "which uses semantic similarity and trajectory analysis to handle edge cases the rule-based strategies miss."
));

bodyChildren.push(body(
  "Aggregation is not a one-time operation. As new Events arrive, the aggregation logic may decide to merge " +
  "two Incidents (if it becomes clear they are the same fire) or split an Incident (if satellite data reveals " +
  "two distinct hotspots that were initially clustered). These operations are logged; the audit trail is " +
  "preserved for post-incident analysis."
));

bodyChildren.push(h2("5.5 Conflict Resolution"));
bodyChildren.push(body(
  "When two sources disagree — NASA FIRMS detects a hotspot that ANEPC has not confirmed, or a community report " +
  "contradicts an official bulletin — the platform must decide what to display. This is a policy question, not " +
  "an engineering one, and the policy must be explicit, versioned, and testable."
));

bodyChildren.push(calloutBox(
  "Conflict Resolution Policy v1",
  "Official sources (ANEPC, ICNF, municipalities) always take precedence over satellite and community sources " +
  "for status fields (active/contained/resolved). For detection fields (location, area, time), the highest-confidence " +
  "source wins, regardless of source type. For community reports, the platform never overrides official status, " +
  "but it does display community reports alongside official information with clear provenance labels. The policy " +
  "is versioned in source control; changes require a written incident postmortem justifying the modification."
));

bodyChildren.push(h2("5.6 Cadence Mismatch"));
bodyChildren.push(body(
  "Different sources operate at different cadences, and the event model must accommodate this. NASA FIRMS " +
  "publishes approximately every 15 minutes during satellite overpasses. ANEPC bulletins are human-paced, " +
  "minutes to hours. Community reports arrive in sub-second bursts during major events. The ingestion pipeline " +
  "treats these very differently."
));

bodyChildren.push(tableTitle("Table 5.3: Source Cadence Characteristics"));
bodyChildren.push(dataTable(
  ["Source", "Cadence", "Volume", "Pipeline Treatment"],
  [
    ["NASA FIRMS", "~15 min (during overpass)", "Hundreds per day", "Batch fetch, queue, async process"],
    ["ANEPC bulletins", "Minutes to hours (during events)", "Tens per day", "Webhook if available, else poll"],
    ["IPMA weather", "Hourly", "Hundreds per day", "Scheduled fetch, batch process"],
    ["Community reports", "Sub-second bursts", "Thousands per day (peak)", "Stream ingest, throttle, real-time"],
    ["News articles", "Minutes", "Tens per day (relevant)", "Continuous crawl, NLP filter, async process"],
  ],
  { colWidths: [22, 24, 22, 32] }
));

// ============ 6. THE TRUST ENGINE ============
bodyChildren.push(h1("6. The Trust Engine"));

bodyChildren.push(h2("6.1 Why Trust is a Platform Primitive"));
bodyChildren.push(body(
  "The Trust Engine is the single architectural decision that most distinguishes Ember from existing fire maps. " +
  "Most platforms treat trust as a display concern — show a badge, color-code a pin, append a disclaimer. This " +
  "is trust as decoration. Ember treats trust as a platform primitive — every engine consumes it, every event " +
  "carries it, every decision the platform makes is filtered through it."
));

bodyChildren.push(body(
  "The difference matters because trust is not a property of the display; it is a property of the information. " +
  "A satellite hotspot at 30 percent confidence should be styled differently, gated differently in notifications, " +
  "weighted differently in AI clustering, and prioritized differently in the professional dashboard. If trust " +
  "lives only in the UI, every engine re-implements its own trust logic, and they drift apart. If trust is a " +
  "platform primitive, the engines stay consistent and the platform evolves coherently."
));

bodyChildren.push(h2("6.2 The Trust Envelope"));
bodyChildren.push(body(
  "Every Event carries a trust envelope — a structured object capturing everything the platform knows about " +
  "the event's reliability. The envelope is computed at ingestion time and updated asynchronously as new " +
  "information arrives."
));

bodyChildren.push(tableTitle("Table 6.1: Trust Envelope Schema"));
bodyChildren.push(dataTable(
  ["Field", "Type", "Description"],
  [
    ["confidence", "float (0-1)", "Computed confidence score; primary trust signal"],
    ["source_reputation", "float (0-1)", "Rolling reputation of the source, based on historical accuracy"],
    ["verification_status", "enum", "unverified / single-source / corroborated / officially-verified"],
    ["corroboration_count", "integer", "Number of independent sources confirming this event"],
    ["corroborating_sources", "array", "List of source names that have confirmed"],
    ["freshness_seconds", "integer", "Seconds since observed_at; trust decays with age"],
    ["computed_at", "timestamp", "When the envelope was last recomputed"],
    ["computation_version", "string", "Version of the trust algorithm that produced this envelope"],
  ],
  { colWidths: [26, 22, 52] }
));

bodyChildren.push(h2("6.3 The Confidence Formula"));
bodyChildren.push(body(
  "The confidence score is the primary trust signal. It is a weighted combination of source reputation, " +
  "corroboration, freshness, and (for community reports) reporter reputation. The formula is deliberately " +
  "transparent and versioned; users who care can inspect it."
));

bodyChildren.push(code(
`confidence = w_source * source_reputation
           + w_corroboration * (1 - 1 / (1 + corroboration_count))
           + w_freshness * freshness_decay(observed_at)
           + w_reporter * reporter_reputation   // community reports only

where:
  w_source + w_corroboration + w_freshness + w_reporter = 1
  default weights: 0.4, 0.3, 0.2, 0.1 (community: 0.3, 0.2, 0.2, 0.3)
  freshness_decay(t) = max(0, 1 - (now - t) / FRESHNESS_HALFLIFE)
  FRESHNESS_HALFLIFE = 6 hours (configurable per source type)`
));

bodyChildren.push(body(
  "The weights are tunable per source type. Satellite sources weight source reputation highly (NASA FIRMS is " +
  "almost always right when it detects a hotspot, but it misses small fires). Community sources weight reporter " +
  "reputation more heavily (a single anonymous report is weak; a report from a verified local firefighter is " +
  "strong). Official sources weight freshness less, because official bulletins remain authoritative even when " +
  "they are hours old."
));

bodyChildren.push(h2("6.4 Source Reputation"));
bodyChildren.push(body(
  "Source reputation is a rolling score, recomputed nightly, based on the source's historical accuracy. For " +
  "official sources, reputation is initialized high (0.9) and rarely moves. For community sources, reputation " +
  "starts at 0.5 and evolves with the reporter's track record. For news sources, reputation is per-publisher " +
  "and based on geolocation accuracy and correction rate."
));

bodyChildren.push(body(
  "Reputation updates use a simple Bayesian update: each event from a source contributes evidence for or " +
  "against that source's reliability. A NASA FIRMS detection that is later confirmed by ANEPC is positive " +
  "evidence; one that is later determined to be a false positive (e.g., a controlled burn) is negative " +
  "evidence. The update is conservative — a single false positive does not destroy a source's reputation, " +
  "but a pattern of them does."
));

bodyChildren.push(h2("6.5 Verification Status"));
bodyChildren.push(body(
  "Verification status is the qualitative complement to the quantitative confidence score. It captures whether " +
  "the event has been confirmed by independent sources, which is a stronger signal than confidence alone."
));

bodyChildren.push(tableTitle("Table 6.2: Verification Status Ladder"));
bodyChildren.push(dataTable(
  ["Status", "Meaning", "Display Treatment"],
  [
    ["unverified", "Single source, no corroboration", "Subtle styling; \"unconfirmed\" label"],
    ["single-source", "One source, reputation high enough to display prominently", "Standard styling; source name shown"],
    ["corroborated", "Two or more independent sources agree", "Prominent styling; \"confirmed\" badge"],
    ["officially-verified", "An official source (ANEPC, municipality) has confirmed", "Maximum prominence; \"official\" badge"],
  ],
  { colWidths: [22, 38, 40] }
));

bodyChildren.push(h2("6.6 Trust in Conflict Resolution"));
bodyChildren.push(body(
  "Trust plays a central role in conflict resolution (see Section 5.5). When two sources disagree, the higher-" +
  "trust source wins for the disputed field. However, the platform never silently discards the lower-trust " +
  "information — it is preserved in the audit trail and may be displayed with a \"disputed\" label if the " +
  "trust gap is narrow."
));

bodyChildren.push(body(
  "This approach is deliberately conservative. Discarding information because the platform decided it was " +
  "wrong is a form of epistemic arrogance that is dangerous on a public safety platform. Better to display " +
  "the conflict and let the user — or, in professional contexts, the operator — make the final judgment."
));

bodyChildren.push(h2("6.7 Trust Decay and Re-evaluation"));
bodyChildren.push(body(
  "Trust is not static. As time passes without corroboration, confidence decays. As new corroboration arrives, " +
  "confidence jumps. As a source's reputation changes (a community reporter accumulates a strong track record), " +
  "historical events from that source are retroactively re-scored. The Trust Engine runs a continuous " +
  "re-evaluation job that processes these updates and publishes trust-change events to the bus."
));

bodyChildren.push(body(
  "Downstream engines react to trust changes. The Map Engine re-styles an incident when its trust envelope " +
  "changes meaningfully (more than 0.1 in confidence, or a verification status transition). The Notification " +
  "Engine re-evaluates whether to alert when trust crosses the alert threshold. The AI Pipeline re-clusters " +
  "when trust changes invalidate previous clustering decisions."
));

// ============ 7. OBSERVABILITY & RELIABILITY ============
bodyChildren.push(h1("7. Observability & Reliability"));

bodyChildren.push(h2("7.1 The Life-Safety Stance"));
bodyChildren.push(body(
  "Observability on Ember is not a DevOps nice-to-have. It is a life-safety function. When a wildfire is " +
  "burning and a citizen opens the platform, the platform must work. If the ANEPC connector has been down " +
  "for 20 minutes and nobody noticed, that is a critical incident — not a backlog item. The observability " +
  "stack is designed to make such failures impossible to miss."
));

bodyChildren.push(body(
  "The stance is aggressive: every data flow emits health, freshness, and quality metrics. Every connector " +
  "has a per-source freshness SLA. Every alert channel has delivery latency tracking. Every user-facing " +
  "page has synthetic monitoring. The cost of this instrumentation is real — it adds perhaps 15 percent to " +
  "engineering effort — but the cost of missing a connector outage during a fire event is unacceptable."
));

bodyChildren.push(h2("7.2 Per-Source Freshness SLAs"));
bodyChildren.push(body(
  "Every data source has a freshness SLA: the maximum acceptable delay between when a source publishes " +
  "information and when that information is visible on the platform. SLAs are source-specific because " +
  "sources have different natural cadences."
));

bodyChildren.push(tableTitle("Table 7.1: Per-Source Freshness SLAs"));
bodyChildren.push(dataTable(
  ["Source", "Natural Cadence", "SLA (visible within)", "Alert Threshold"],
  [
    ["NASA FIRMS", "~15 min during overpass", "5 minutes", "10 minutes"],
    ["ANEPC bulletins", "Variable", "2 minutes (after publication)", "5 minutes"],
    ["IPMA weather", "Hourly", "10 minutes", "20 minutes"],
    ["Community reports", "Real-time", "30 seconds", "60 seconds"],
    ["News articles", "Minutes", "15 minutes", "30 minutes"],
  ],
  { colWidths: [22, 22, 26, 30] }
));

bodyChildren.push(body(
  "When a source violates its SLA, the observability stack raises a PagerDuty alert. The on-call engineer " +
  "must acknowledge within 5 minutes. If the SLA violation affects a user-facing feature, the platform " +
  "displays a \"data may be delayed\" banner rather than silently serving stale data."
));

bodyChildren.push(h2("7.3 Connector Health Dashboards"));
bodyChildren.push(body(
  "Each connector has a health dashboard exposing: last successful fetch, last failed fetch, error rate, " +
  "queue depth, processing latency, and downstream visibility (are the events ingested in the last hour " +
  "actually being rendered on the map?). These dashboards are public to the engineering team and reviewed " +
  "weekly. Patterns of degraded performance trigger connector refactoring work."
));

bodyChildren.push(h2("7.4 Alert Delivery Latency Tracking"));
bodyChildren.push(body(
  "Push notifications are the platform's highest-stakes output. The observability stack tracks end-to-end " +
  "latency from event publication to push delivery receipt. The SLA is 60 seconds for critical alerts; " +
  "violations are paged immediately. The stack also tracks delivery success rate per channel (APNS, FCM, " +
  "email, SMS) and per geographic region."
));

bodyChildren.push(h2("7.5 Synthetic Monitoring"));
bodyChildren.push(body(
  "Synthetic monitors simulate user behavior every minute from multiple geographic locations. The citizen map " +
  "is loaded, an incident is clicked, a search is performed. Any failure or significant slowdown triggers an " +
  "alert. Synthetic monitoring catches issues that internal health checks miss — DNS problems, CDN failures, " +
  "certificate expirations."
));

bodyChildren.push(h2("7.6 Incident Response"));
bodyChildren.push(body(
  "The platform has a written incident response runbook covering: connector outages, data quality issues " +
  "(false positives or missing detections), push delivery failures, and platform outages. Each scenario has " +
  "a defined severity, response SLA, escalation path, and postmortem template. Postmortems are published " +
  "internally within 48 hours and contribute to the architectural evolution of the platform."
));

bodyChildren.push(h2("7.7 The Reliability Budget"));
bodyChildren.push(body(
  "The platform targets 99.5 percent uptime during fire season (June through October) and 99.0 percent " +
  "off-season. These targets are deliberately modest — chasing five nines on a platform with this much " +
  "external dependency is unrealistic. The budget is spent on the things that matter: connector availability, " +
  "push delivery, and map rendering. Cosmetic features may degrade without violating the budget."
));

// ============ 8. LEGAL & COMPLIANCE ============
bodyChildren.push(h1("8. Legal & Compliance"));

bodyChildren.push(h2("8.1 The Compliance Stance"));
bodyChildren.push(body(
  "Legal compliance on a public safety platform is not a checkbox exercise. The platform handles personal data " +
  "(community reports with photos and locations), official data with licensing restrictions, user-generated " +
  "content subject to EU regulation, and operational data with potential evidentiary value. Each of these " +
  "carries legal obligations that must be designed into the architecture, not bolted on."
));

bodyChildren.push(body(
  "The compliance stance is conservative: when in doubt, design for the stricter interpretation. This costs " +
  "some product flexibility but protects the platform from existential legal risk. The alternative — building " +
  "fast and asking forgiveness later — is incompatible with a platform that aspires to institutional trust."
));

bodyChildren.push(h2("8.2 GDPR and Community Reports"));
bodyChildren.push(body(
  "Community reports almost always contain personal data: a photo may show faces, a location may reveal a " +
  "user's home or workplace, a report timestamp may establish a user's whereabouts. The platform treats all " +
  "community reports as personal data subject to GDPR."
));

bodyChildren.push(body(
  "The architecture enforces this through several mechanisms. First, explicit consent is required at report " +
  "submission, with granular options (consent to display, consent to retain for analysis, consent to share " +
  "with authorities). Second, reports are stored with a retention policy — by default 90 days, configurable " +
  "per report. Third, the right to be forgotten is implemented as a hard delete that propagates through all " +
  "derived data, including AI enrichments. Fourth, EXIF data is stripped at upload to prevent inadvertent " +
  "location leakage."
));

bodyChildren.push(h2("8.3 EU Digital Services Act (DSA)"));
bodyChildren.push(body(
  "The platform's community layer is subject to the EU DSA, which imposes obligations on online platforms " +
  "that host user-generated content. Key obligations include: clear terms of service, mechanisms for reporting " +
  "illegal content, transparency reporting, and (for VLOPs — very large online platforms) additional risk " +
  "assessment and mitigation duties."
));

bodyChildren.push(body(
  "Ember is unlikely to reach VLOP thresholds in its early years, but the DSA's content moderation obligations " +
  "apply from day one. The architecture supports this through: a moderation queue with SLA tracking, transparent " +
  "appeal mechanisms, and a public transparency report published quarterly. The trust engine's reputation system " +
  "is designed to be auditable — a user can request an explanation of their reputation score."
));

bodyChildren.push(h2("8.4 Per-Source Data Licensing"));
bodyChildren.push(body(
  "Every official data source has its own licensing terms, and the platform must respect each one. ANEPC data " +
  "may have terms different from ICNF data, which may have terms different from NASA FIRMS data. The architecture " +
  "enforces this through per-source license metadata stored on every event."
));

bodyChildren.push(tableTitle("Table 8.1: Source Licensing Summary"));
bodyChildren.push(dataTable(
  ["Source", "License Type", "Key Restrictions"],
  [
    ["NASA FIRMS", "Public domain (NASA)", "Attribution requested; no restriction on derivative use"],
    ["ANEPC (if available)", "To be negotiated", "Likely requires attribution; commercial use TBD"],
    ["IPMA", "Mixed; some data is CC-BY, some is restricted", "Weather data typically CC-BY; forecast models may differ"],
    ["ICNF", "To be confirmed", "Forest data often has restrictions on commercial redistribution"],
    ["DGT (Cartográfica)", "CC-BY 4.0 typically", "Attribution required; boundary data freely usable"],
    ["News articles", "Copyrighted; fair use for summaries", "Show snippet + link; do not republish full text"],
  ],
  { colWidths: [22, 26, 52] }
));

bodyChildren.push(body(
  "The licensing review is a Phase 0 deliverable and must be completed before any source is integrated. The " +
  "Data Source Inventory & Connector Spec document tracks the licensing status of each source. Sources with " +
  "unfavorable licensing terms are not integrated; the platform's value proposition does not depend on any " +
  "single source."
));

bodyChildren.push(h2("8.5 Right to Be Forgotten"));
bodyChildren.push(body(
  "GDPR's right to erasure (Article 17) applies to personal data the platform holds. For community reports, " +
  "this is straightforward in principle — delete the report — but complex in practice because the report may " +
  "have been aggregated into an Incident, cited by AI enrichments, or referenced in audit logs."
));

bodyChildren.push(body(
  "The architecture handles this through a cascading delete: the report itself, then all references in derived " +
  "data, then audit log entries (with the exception of legal-hold records, which are retained per legal counsel " +
  "advice). The delete operation is idempotent and asynchronous — it may take up to 24 hours to fully propagate, " +
  "but the user-facing effect (the report disappears from the platform) is immediate."
));

bodyChildren.push(h2("8.6 Data Residency"));
bodyChildren.push(body(
  "Personal data is stored in EU data centers. The default deployment region is eu-west (Ireland or Frankfurt). " +
  "Backups are within the EU. Cross-border data transfers are minimized — the only non-EU dependency is NASA " +
  "FIRMS, which is a data source (not a storage provider), and which is covered by an adequacy decision or " +
  "standard contractual clauses."
));

bodyChildren.push(h2("8.7 Operational Data and Evidentiary Value"));
bodyChildren.push(body(
  "Platform data may have evidentiary value in post-incident investigations, insurance claims, or legal " +
  "proceedings. The architecture preserves data integrity through: immutable event storage (events never " +
  "change after creation), append-only audit logs, and cryptographic timestamping of critical records. Data " +
  "retention policies are defined per data class and reviewed annually."
));

// ============ 9. IDENTITY & REPUTATION ============
bodyChildren.push(h1("9. Identity & Reputation"));

bodyChildren.push(h2("9.1 Why Identity Matters"));
bodyChildren.push(body(
  "Identity is the foundation of the community layer. Without it, the platform cannot distinguish between a " +
  "verified local firefighter reporting a real fire and a malicious actor submitting false reports. With it, " +
  "the platform can build reputation, gate sensitive features, and provide meaningful trust signals to other " +
  "users. Identity is therefore a Phase 2 prerequisite, not an afterthought."
));

bodyChildren.push(h2("9.2 Identity Tiers"));
bodyChildren.push(body(
  "The platform supports multiple identity tiers, each with different capabilities. The tiered approach balances " +
  "accessibility (anyone can report) with accountability (verified users have more weight)."
));

bodyChildren.push(tableTitle("Table 9.1: Identity Tiers"));
bodyChildren.push(dataTable(
  ["Tier", "Requirements", "Capabilities", "Trust Weight"],
  [
    ["Anonymous", "None (rate-limited)", "Submit text-only reports; no media uploads", "Low (0.3 default)"],
    ["Registered", "Email verification", "Full reporting; follow incidents; save searches", "Medium (0.5 default)"],
    ["Verified Local", "Phone + address verification", "Reports weighted higher; reputation accrues faster", "High (0.7 default)"],
    ["Professional", "Org verification (firefighter, forester, etc.)", "Reports marked as professional; advanced features", "Very high (0.9 default)"],
    ["Official", "Institutional account (ANEPC, municipality)", "Authoritative bulletins; override capability", "Maximum (1.0 default)"],
  ],
  { colWidths: [18, 26, 36, 20] }
));

bodyChildren.push(h2("9.3 The Reputation System"));
bodyChildren.push(body(
  "Reputation is a per-user score that evolves based on the user's reporting history. A user who consistently " +
  "submits accurate, useful reports sees their reputation rise; a user who submits false or low-quality reports " +
  "sees it fall. Reputation feeds directly into the trust envelope of that user's reports."
));

bodyChildren.push(body(
  "Reputation updates use the same Bayesian approach as source reputation (see Section 6.4). Each report " +
  "contributes evidence: a report later confirmed by official sources is positive evidence; one that is " +
  "contradicted is negative. The system is conservative — a single mistake does not destroy a reputation, " +
  "but a pattern of them does. Users can request a reputation review if they believe the score is unfair."
));

bodyChildren.push(h2("9.4 Abuse Prevention"));
bodyChildren.push(body(
  "Reputation systems are vulnerable to abuse: coordinated false reports, reputation farming, identity fraud. " +
  "The platform defends against these through: rate limiting (especially for low-tier accounts), anomaly " +
  "detection (sudden bursts of reports from new accounts), and human review of suspicious patterns. The abuse " +
  "prevention system is itself a target — the team monitors for attempts to game it and adapts defenses " +
  "accordingly."
));

bodyChildren.push(h2("9.5 Authentication Architecture"));
bodyChildren.push(body(
  "Authentication uses NextAuth.js with multiple providers: email/password (with strong password requirements), " +
  "magic link (passwordless), and OAuth (Google, Apple, Microsoft for enterprise). Multi-factor authentication " +
  "is required for professional and official accounts. Session management uses short-lived JWTs with refresh " +
  "tokens; sessions are revocable."
));

bodyChildren.push(body(
  "Account recovery is a recognized attack vector. The platform uses a combination of recovery codes (generated " +
  "at enrollment), email-based recovery (with delay for security), and manual review for high-tier accounts. " +
  "Recovery for Official accounts requires institutional verification — losing access to an Official account " +
  "is treated as a security incident."
));

// ============ 10. OPEN QUESTIONS ============
bodyChildren.push(h1("10. Open Architectural Questions"));

bodyChildren.push(body(
  "This section records the architectural questions the platform has not yet resolved. They are the agenda " +
  "for the next architectural iteration. None of them block the citizen MVP, but several will become urgent " +
  "as the platform approaches Phase 2 (community) and Phase 6 (AI)."
));

bodyChildren.push(h2("10.1 Aggregation Strategy Tuning"));
bodyChildren.push(body(
  "The spatial-temporal clustering parameters (5 km, 6 hours) are initial guesses. They will need tuning based " +
  "on real fire behavior, which varies significantly by Portuguese region (Algarve fires behave differently " +
  "from Gerês fires). The team will need to instrument the aggregation logic to track false-merges and false-" +
  "splits, and adjust parameters accordingly. AI-assisted clustering (Phase 6+) may eventually replace the " +
  "rule-based approach entirely."
));

bodyChildren.push(h2("10.2 Trust Algorithm Versioning"));
bodyChildren.push(body(
  "The trust algorithm will evolve. Versioning is straightforward for new events (use the latest version), " +
  "but retroactive re-scoring of historical events is expensive and may distort historical analysis. The team " +
  "needs to decide: do we re-score history when the algorithm changes, or do we accept that historical trust " +
  "scores reflect the algorithm in effect at the time? The current lean is toward the latter, with a clear " +
  "versioning marker on every trust envelope."
));

bodyChildren.push(h2("10.3 The Boundary Between E2a and E2b"));
bodyChildren.push(body(
  "The split between the citizen map (E2a) and the pro map (E2b) is clear in principle but fuzzy in practice. " +
  "Some features — historical playback, for example — are valuable to citizens but borderline in scope. The " +
  "team needs a clear decision framework for what belongs in E2a, what belongs in E2b, and what should be " +
  "available to citizens as a stripped-down version of a pro feature."
));

bodyChildren.push(h2("10.4 Multi-Tenancy for the Professional Platform"));
bodyChildren.push(body(
  "Phase 7's professional platform introduces multi-tenancy: municipalities, utilities, and forestry companies " +
  "each have their own view, with their own data layers and their own access controls. The architecture supports " +
  "this in principle (the Event Engine is tenant-agnostic; tenancy is an access-control layer), but the details " +
  "of tenant isolation, data segregation, and per-tenant customization need to be worked out before Phase 7 " +
  "development begins."
));

bodyChildren.push(h2("10.5 The European Expansion Data Model"));
bodyChildren.push(body(
  "Phase 9's European expansion will require integrating each country's official emergency data sources, which " +
  "differ in format, cadence, and licensing. The event model is designed to be source-agnostic, but the geo " +
  "enrichment pipeline is currently Portugal-specific (municipality, parish, etc.). The team needs to design " +
  "a country-agnostic enrichment schema that can accommodate different administrative hierarchies without " +
  "breaking existing data."
));

bodyChildren.push(h2("10.6 The Biomass Operations Spin-Off Decision"));
bodyChildren.push(body(
  "Phase 8 (biomass operations) is a marketplace and logistics business, not a platform feature. The architectural " +
  "question is whether to integrate it into the Ember platform (mixing platform DNA with operations DNA, with " +
  "the risks that entails) or to spin it out as a separate company that contracts with Ember for data. The " +
  "current lean is toward spin-out, but the decision is deferred until Phase 5, when the prevention platform " +
  "data is mature enough to evaluate the opportunity realistically."
));

bodyChildren.push(h2("10.7 The AI Governance Question"));
bodyChildren.push(body(
  "Phase 6 introduces AI-driven features: clustering, summarization, duplicate detection. Each of these has " +
  "governance implications. Who is responsible when the AI clusters two unrelated fires together? When the " +
  "summary omits a critical detail? When the duplicate detector suppresses a real report? The team needs an " +
  "AI governance framework that defines accountability, auditability, and human-in-the-loop checkpoints for " +
  "each AI feature."
));

bodyChildren.push(h1("11. Conclusion"));

bodyChildren.push(body(
  "This document has set out the architectural foundations for a platform that aspires to be more than a fire " +
  "map. The three-roadmap discipline, the engine decomposition, the event model, the trust engine, and the " +
  "explicit treatment of observability and legal compliance together form an architecture that can scale from " +
  "a citizen MVP to a European multi-hazard platform without re-architecture."
));

bodyChildren.push(body(
  "The architecture is deliberately conservative in some places (no microservices until scale demands them, " +
  "no novel technologies where mature ones exist) and deliberately ambitious in others (trust as a platform " +
  "primitive, the event/aggregate distinction, the life-safety observability stance). The conservatism is " +
  "about minimizing execution risk; the ambition is about not painting the platform into a corner."
));

bodyChildren.push(body(
  "What this architecture does not do is ship the citizen MVP. That is the work of the next phase: turning " +
  "these foundations into running code, real connectors, and a map that citizens actually prefer. The " +
  "foundations exist to make that work tractable and to ensure that, as the platform grows, it grows coherently."
));

bodyChildren.push(body(
  "The team's commitment is to revisit this document every six months, update it to reflect what has been " +
  "learned, and treat the open questions in Section 10 as a working agenda rather than a deferred burden. " +
  "Architecture is not a one-time decision; it is a continuous practice. This document is the starting point " +
  "of that practice for the Ember platform."
));

// === Build document ===
const coverConfig = {
  title: "Architecture Foundations",
  subtitle: "Ember Platform — Wildfire Intelligence for Portugal and Beyond",
  englishLabel: "ARCHITECTURE FOUNDATIONS",
  metaLines: [
    "Document Type:  Architecture Foundations Reference",
    "Version:  1.0  (Initial Release)",
    "Status:  Draft for Collaborator Review",
    "Date:  July 2026",
    "Codename:  Ember",
  ],
  footerLeft: "Ember Platform — Architecture Foundations",
  footerRight: "Confidential — Internal",
};

const doc = buildDocument({
  coverConfig,
  bodyChildren,
  headerTitle: "Ember — Architecture Foundations",
});

// Attach numbering configs to the document after construction
doc.numbering.config = numberingConfigs;

const outputPath = "/home/z/my-project/download/Ember-Architecture-Foundations.docx";
U.docx.Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(outputPath, buf);
  console.log(`✓ Architecture Foundations DOCX written: ${outputPath}`);
  console.log(`  Size: ${(buf.length / 1024).toFixed(1)} KB`);
}).catch(err => {
  console.error("✗ Generation failed:", err);
  process.exit(1);
});
