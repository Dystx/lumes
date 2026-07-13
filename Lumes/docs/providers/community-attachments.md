# Community-report attachments: design and approval gate

**Status:** design only; uploads are not enabled.

**Scope:** visual attachments submitted with a community wildfire report.
This document deliberately does not select a storage provider, add a Prisma
migration, or turn the existing `CommunityReport.photoUrl` placeholder into an
upload contract.

## Decision boundary

The current report flow remains JSON-only. Before an attachment control or
multipart endpoint is shipped, Lumes must have all of the following:

1. an approved storage provider and EU-region/data-processing review;
2. a moderation owner and an auditable quarantine-to-public workflow;
3. a retention, deletion, and backup policy that is reflected in the privacy
   notice;
4. server-side media validation/re-encoding and EXIF removal;
5. an upload authorization mechanism that is one-time, short-lived, and bound
   to the pending report;
6. a tested byte/rate budget for the origin, provider, and mobile clients.

Until those gates pass, the public form must not accept a file input and
`photoUrl` must remain `null`.

## Proposed Phase 1 scope

When approved, start with **images only**: JPEG, PNG, and WebP after decoding.
Defer video, animated formats, SVG, PDFs, audio, and arbitrary files. A
proposed (not yet final) envelope is:

- one image per report;
- 8 MiB maximum upload bytes;
- 12 megapixels maximum decoded dimensions;
- server-produced derivative capped to a safe display size;
- no client-supplied MIME type, filename, EXIF field, or URL trusted;
- upload intent expires quickly and is single-use;
- public visibility requires moderation approval.

The final limits must be checked against the chosen provider, VPS memory,
mobile bandwidth, and the moderation queue before implementation.

## Safe data flow

```text
Create report
  -> issue one-time upload intent bound to report + session
  -> receive bounded bytes into quarantine
  -> verify magic bytes and decode with a server image library
  -> strip EXIF/GPS, re-encode, hash, and store an opaque key
  -> malware/content checks and attributable human moderation
  -> approved derivative becomes readable through a short-lived proxy/signed URL
  -> expiry/deletion job removes blob, derivative, metadata, and intent
```

The report identifier is not upload authorization. The intent token must be
stored hashed, expire, be single-use, and be invalidated on report rejection or
deletion. A raw provider URL must never be stored in the public report DTO.

## Provider-neutral boundary

The application should depend on a small adapter rather than an S3/R2/MinIO
SDK in the route or modal:

```ts
interface AttachmentStore {
  put(input: {
    key: string;
    bytes: Uint8Array;
    mediaType: "image/jpeg" | "image/png" | "image/webp";
    sha256: string;
  }): Promise<{ key: string; byteSize: number; sha256: string }>;
  readApproved(key: string): Promise<ReadableStream<Uint8Array> | null>;
  delete(key: string): Promise<void>;
}
```

The database relation should store logical metadata, not a provider URL:

```text
CommunityReportAttachment
- id, reportId
- logicalKey (opaque, unique)
- mediaType, byteSize, sha256
- status: quarantined | approved | rejected | expired | deleted
- createdAt, expiresAt, reviewedAt, reviewedBy
```

The existing nullable `photoUrl` field should be deprecated through a planned
migration rather than reused. SQLite should store metadata only; image bytes
should live outside the application database.

## Provider decision matrix

| Candidate | Potential benefit | Approval risk / required evidence |
| --- | --- | --- |
| Cloudflare R2 or equivalent object storage | Fits the existing Cloudflare edge plan and an S3-compatible adapter | EU-region availability, DPA, egress/retention cost, signed-read behaviour, deletion guarantees, and account ownership must be confirmed |
| EU-hosted S3-compatible provider | Clear regional hosting and portable API | DPA, backups, lifecycle rules, CORS, signed URLs, operational ownership, and incident response must be confirmed |
| Self-hosted MinIO on the VPS | Full control and no third-party object API | Not acceptable by default for public media: backup, disk exhaustion, malware isolation, exposure, replication, and disaster recovery become Lumes responsibilities |

No candidate is approved by this document. The chosen provider must have a
written licence/DPA/region record, lifecycle and deletion evidence, a health
budget, and a rollback/retirement procedure before code is merged.

## Technical candidate audit: Cloudflare R2 (2026-07-13)

R2 is the strongest technical candidate to investigate first because Lumes
already uses Cloudflare at the edge and the provider exposes an S3-compatible
adapter boundary. This is technical due diligence only; it is **not** a
storage, legal, privacy, or production approval.

### Evidence that fits the proposed boundary

- R2 supports private buckets by default and S3-compatible `GET`, `PUT`,
  `HEAD`, and `DELETE` operations. Presigned URLs can be scoped to one object
  and one operation, with expiries from one second to seven days. Lumes would
  use a much shorter one-time upload intent and would never expose provider
  credentials.
- Browser use of presigned URLs requires an explicit bucket CORS policy. The
  upload signature can bind the expected `Content-Type`; the server must still
  validate bytes, decode, strip EXIF, re-encode, and moderate before approval.
- R2 supports an `eu` jurisdiction that guarantees objects are stored and
  processed within the European Union. The jurisdiction is selected when the
  bucket is created and cannot be changed later, so a production bucket must
  not be created with the default automatic location by mistake.
- Object lifecycle rules can expire quarantine and derivative prefixes. R2
  documents that lifecycle deletion is typically within 24 hours, so the
  application deletion path remains authoritative and lifecycle is only a
  backstop. A custom-domain cache can continue serving a deleted object until
  its cache is purged; approved media should therefore use a short-lived
  authenticated proxy/read path rather than a permanently public bucket URL.
- Presigned URLs use the R2 S3 endpoint rather than a custom domain. This is
  compatible with the provider-neutral `AttachmentStore.readApproved` design,
  which can keep provider URLs out of the public DTO.

Official references:

- [R2 data location and EU jurisdiction](https://developers.cloudflare.com/r2/reference/data-location/)
- [R2 presigned URLs and security considerations](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [R2 browser CORS configuration](https://developers.cloudflare.com/r2/buckets/cors/)
- [R2 object lifecycles](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)
- [R2 consistency and cache behaviour](https://developers.cloudflare.com/r2/reference/consistency/)
- [Cloudflare Customer DPA](https://www.cloudflare.com/en-gb/cloudflare-customer-dpa/)
- [Cloudflare GDPR guidance](https://www.cloudflare.com/trust-hub/gdpr/)
- [Cloudflare metadata boundary](https://developers.cloudflare.com/data-localization/metadata-boundary/)

### Remaining approval gates

R2 remains **candidate / technically plausible**, not approved. Before any
bucket, SDK, upload route, or UI change, obtain and record:

1. Cloudflare account ownership, billing, EU-jurisdiction creation proof, and
   the applicable Cloudflare DPA/data-processing terms;
2. a decision that direct browser PUTs are acceptable, or a server/proxy flow
   that keeps all bearer URLs off the public surface;
3. tested deletion and cache-purge behaviour for quarantined, approved,
   rejected, expired, and user-deleted objects;
4. backup/restore and account-recovery ownership, including what happens if
   the Cloudflare account or bucket is retired;
5. a byte/rate/mobile budget measured against the VPS and moderation queue;
6. a moderation owner and privacy-notice update covering image contents,
   location clues, people, vehicles, and retention.

### R2 gate matrix

| Gate | Current evidence | Status |
| --- | --- | --- |
| EU object residency | An `eu` jurisdiction bucket and `.eu` S3 endpoint provide the technical control; the jurisdiction is immutable after creation | **Technical pass; legal scope open** |
| S3 adapter | Put/read/delete/list and content metadata fit the adapter; R2 S3 compatibility does not provide versioning, object tags, ACLs, KMS-SSE, or S3 Object Lock | **Pass with app-owned state** |
| One-time upload | Presigned PUT can be short-lived and content-type-bound, but the URL remains reusable until expiry | **Partial; app intent/replay controls required** |
| Browser upload | Exact-origin CORS supports direct PUT; server proxy avoids browser CORS for reads | **Partial; configuration and budget evidence required** |
| Retention/erasure | Explicit delete is immediately visible to direct API reads; lifecycle is typically within 24 hours; cached custom-domain content can persist | **Partial; cache/backup/physical-erasure policy required** |
| Quarantine/moderation | Object events can notify a queue or HTTP consumer | **Partial; Lumes still owns decode, re-encode, EXIF, malware, and human review** |
| Durability/cost | R2 documents eleven-nines durability and no egress charge; availability/SLA entitlement and budget still need confirmation | **Partial; account and operations review required** |
| Legal/privacy | Cloudflare DPA, subprocessors, SCC/DPF mechanism, and whether edge/log/support metadata must remain EU are not accepted decisions | **Blocked pending named owner** |

Until those gates are signed off, the existing JSON-only report route and
`photoUrl: null` contract remain the correct implementation.

The owner decision questions and approval record are prepared in
[`community-attachments-approval-request.md`](./community-attachments-approval-request.md).
That packet is not a provider approval; uploads remain disabled until its
record is complete.

## Security and privacy requirements

- Keep CSRF, IP/session/report rate limits, and a separate byte/day budget.
- Reject malformed, corrupt, polyglot, SVG, HTML, and extension-only disguised
  files using decoded magic bytes and a server image library.
- Re-encode every accepted image; never publish the original bytes or EXIF.
- Quarantine before moderation; no public bucket listing or permanent raw URL.
- Avoid face/plate recognition claims; provide a clear notice that uploads may
  contain people, vehicles, private property, and location clues.
- Log moderation decisions and storage failures without logging image contents,
  tokens, or signed URLs.
- Make expiry and user deletion remove both database metadata and provider
  objects, including derivatives and failed/quarantined objects.
- Keep attachment metadata out of unauthenticated responses until approved.

## Required implementation files after approval

- `src/lib/attachments/contracts.ts`
- `src/lib/attachments/limits.ts`
- provider adapter under `src/lib/attachments/providers/`
- `src/app/api/reports/[id]/attachments/route.ts` or one bounded multipart route
- `src/lib/report-attachment-client.ts`
- Prisma `CommunityReportAttachment` relation and migration
- moderation/expiry job and audit tests
- privacy-page update and provider record

Required tests include magic-byte/size limits, token replay and expiry, CSRF,
IP/session/report and byte-budget rate limits, fake-store failure/delete,
quarantine/approval visibility, redacted public DTOs, retention cleanup, and
mobile/reduced-motion upload UX. No implementation should begin until the
provider and privacy gates above are signed off.
