# CARTO basemap / building-context entitlement request

**Status:** draft for an authorised project owner to send to CARTO. This
document is a gate artifact, not a licence, grant, or production approval.

**Last official-reference check:** 2026-07-13. CARTO's current public
documentation says commercial basemap use requires an Enterprise licence,
while free non-commercial use is for CARTO grantees; attribution is required
for every CARTO plan. The official request path is the live-demo form or an
RFP sent to `rfp@carto.com`. These statements do not decide Lumes' status or
authorize production use.

Official references:

- <https://docs.carto.com/faqs/carto-basemaps>
- <https://carto.com/attribution/>
- <https://carto.com/grants/>
- <https://carto.com/legal/>
- <https://carto.com/request-live-demo/>

**Related plan:**
[`2026-07-11-3d-incident-focus.md`](../superpowers/plans/2026-07-11-3d-incident-focus.md)

## Purpose

Lumes.pt is a Portugal-wide public wildfire-intelligence application. Its
default map is a top-down operational view. The optional **3D Incident Focus**
mode would temporarily pitch and zoom the existing MapLibre map around one
selected incident. The proposed Phase 2 experiment would add a transient,
incident-local `fill-extrusion` layer from the existing CARTO vector source;
it would not replace the current style, create a second map, bulk-download
tiles, or persist CARTO data in the Lumes database.

The public site is free to citizens and may accept donations. A separate
professional product may be introduced later. We need written confirmation
that the chosen entitlement covers the actual operating model, rather than
assuming that public-benefit status or an unauthenticated tile response is
permission.

## Current technical shape

| Item | Proposed value |
| --- | --- |
| Application | `https://lumes.pt` |
| Renderer | MapLibre GL JS, one existing map instance |
| Current basemap | CARTO/EOX styles already used by Lumes |
| Existing vector source | `carto` |
| Existing building source-layer | `building` |
| Existing height fields | `render_height`, `render_min_height` |
| Proposed layer | transient `lumes-incident-buildings` extrusion, focus mode only |
| Intended zoom | local incident context, bounded to approximately z13–14 |
| Requests | only tiles required by the visible map viewport; no bulk prefetch or archive |
| Persistence | no CARTO tile or feature data stored in SQLite/Prisma |
| Fallback | camera-only 3D or ordinary 2D if the layer is unavailable |
| Attribution | visible in MapLibre attribution and mobile attribution disclosure |

The layer would remain below incident markers, selected halos, evacuation
boundaries, stations, risk, satellite, aerial, biomass, news, and community
overlays. It would be independently removable after tile errors or style
reloads. The production flag remains off until this request is resolved.

## Questions requiring written answers

Please answer each item for the exact Lumes.pt deployment above.

### 1. Entitlement and use classification

1. Does CARTO consider this use **commercial**, **non-commercial**, or another
   category under the current basemap terms?
2. If non-commercial, can CARTO issue a written grant that covers the public
   Lumes.pt site, its donation box, and the proposed incident-local building
   extrusion?
3. If a later paid professional dashboard or API is launched, does the same
   grant cover that use? If not, what Enterprise plan or order form is required?
4. Does the entitlement cover both the current basemap and access to the
   `building` source-layer / height properties used by the optional extrusion?
5. Are there restrictions on displaying CARTO tiles in a public-safety,
   emergency-information, or wildfire-response context?

### 2. Attribution

1. What exact attribution HTML/text must be shown for this entitlement?
2. Must attribution identify CARTO, OpenStreetMap, and any additional data or
   tile providers separately?
3. Is the current MapLibre attribution control sufficient, or are there
   placement, size, contrast, or mobile-disclosure requirements?
4. Does the `fill-extrusion` layer require any additional attribution beyond
   the current basemap attribution?

### 3. Requests, caching, and operations

1. What tile-request quota and rate limit apply to this deployment, including
   any monthly cap, per-minute limit, burst limit, or `429` policy?
2. Is browser-side use from `lumes.pt` permitted without a CARTO API key, or
   must Lumes use an authenticated account/token?
3. May the application rely on normal browser/CDN caching? Are service-worker
   caching, tile persistence, or same-origin proxying restricted?
4. Are `carto.streets` style URLs and TileJSON URLs stable for production use?
   If not, what change notice or version-pinning mechanism is available?
5. What incident, support, and retirement notice should Lumes plan for if the
   style, source-layer, property names, or public tile service changes?

### 4. Data and product behaviour

1. May Lumes render `render_height` and `render_min_height` as local building
   context, including when values are missing or approximate?
2. Are there restrictions on filtering, styling, reducing opacity, or moving
   the building layer below operational overlays?
3. Are tiles/features allowed to be inspected in the browser for rendering,
   or is any feature extraction, indexing, or export prohibited?
4. Are there known Portugal coverage or rural-height limitations that should
   be disclosed to users?

## Evidence to attach to the request

- the exact production hostname and current MapLibre style URLs;
- the current public/non-commercial and future professional-use description;
- the requested attribution placement screenshots or wireframe;
- the bounded z13–14 viewport/request model;
- the fallback behaviour and kill-switch description;
- the current CARTO source/layer/property audit in
  [`3d-context-sources.md`](./3d-context-sources.md).

Do not attach tokens, private configuration, database contents, user reports,
or signed URLs.

## Ready-to-send owner request

An authorised owner can submit the following through
<https://carto.com/request-live-demo/> or send it to `rfp@carto.com`.

**Subject:** Lumes.pt public wildfire-intelligence map — basemap and building-context entitlement

> Hello CARTO team,
>
> We operate Lumes.pt, a Portugal-wide public wildfire-intelligence map. The
> default experience is a top-down operational map for citizens and emergency
> information. The public service is free and may accept donations; a separate
> professional product may be introduced later.
>
> We are requesting written guidance and, if required, an Enterprise licence
> or CARTO grant for this exact use. Lumes uses one MapLibre GL JS map instance
> and the existing CARTO vector source. We would like to add an optional,
> feature-flagged “3D Incident Focus” view that temporarily pitches the map
> around one incident and renders a bounded `building` source-layer extrusion
> from the visible viewport only (approximately zoom 13–14). We would not
> bulk-download, persist, index, export, or sell CARTO tile data. If the
> building layer is unavailable, the UI falls back to camera-only focus or the
> normal 2D map.
>
> Please confirm in writing:
>
> 1. whether the public donation-supported service is commercial or eligible
>    for a grant;
> 2. whether a future paid professional dashboard/API changes the entitlement;
> 3. whether the existing basemap and `building` source-layer/height fields
>    may be rendered in this way;
> 4. the exact attribution text and mobile/MapLibre placement requirements;
> 5. the applicable tile quota, authentication, caching, and `429` policy;
> 6. the change/retirement notice and support terms for the style, source-layer,
>    and property names; and
> 7. any Portugal coverage or rural-height limitations we must disclose.
>
> The public hostname is <https://lumes.pt>. We can provide the current style
> URLs, source/layer audit, fallback behavior, and proposed attribution layout
> on request. Please route this to the team responsible for CARTO Basemaps
> licensing and public application use.
>
> Regards,
> [authorised owner name]
> [organization/contact]

**Submission checklist:**

- [ ] Authorised owner reviewed the public/donation/professional-use wording.
- [ ] Current style URLs and the source/layer audit were attached without
  tokens or private configuration.
- [ ] Request submitted through the official form or `rfp@carto.com`.
- [ ] Case/reference number recorded below.
- [ ] Written response attached to the approval record before any code gate is
  changed.

## Approval record

Complete this section only after the authorised owner receives a written reply.

| Field | Value |
| --- | --- |
| CARTO contact / case | _pending_ |
| Date requested | _not sent_ |
| Entitlement type | _pending_ |
| Public donation use covered? | _pending_ |
| Future professional use covered? | _pending_ |
| Building source-layer use covered? | _pending_ |
| Exact attribution approved | _pending_ |
| Tile quota / owner | _pending_ |
| Caching / proxy terms | _pending_ |
| Change / retirement terms | _pending_ |
| Decision owner | _pending_ |
| Decision | **KEEP GATED** |

## Implementation stop rule

Until the approval record contains a written entitlement, exact attribution,
quota owner, caching terms, and change/retirement terms, do not:

- add a production `fill-extrusion` layer;
- add a CARTO-specific layer registry or provider flag;
- add a PMTiles/building dependency or storage bucket;
- enable the feature in production;
- describe the building context as available to users.

Phase 1 camera-only Incident Focus and the normal top-down operational map
remain the only enabled paths.
