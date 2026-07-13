# Community-report attachment approval packet

**Status:** decision packet only; uploads remain disabled.

**Related design gate:**
[`community-attachments.md`](./community-attachments.md)

This packet turns the attachment design gate into explicit owner decisions. It
must be completed before Lumes adds a file input, multipart route, provider
SDK, Prisma attachment relation, or public media URL.

## Product boundary to approve

The proposed first release accepts **one still image per community report**.
Images are received into quarantine, validated and decoded server-side,
re-encoded with EXIF/GPS removed, reviewed by a named moderator, and exposed
only through an approved derivative. Video, animated formats, SVG, PDF, audio,
and arbitrary files remain excluded.

Proposed limits, pending owner approval:

- 8 MiB maximum request bytes;
- 12 megapixels maximum decoded dimensions;
- one image per report;
- short-lived, single-use upload intent bound to the pending report;
- no provider URL in public report DTOs;
- application-owned deletion plus provider lifecycle as a backstop.

## Decisions required

### 1. Storage and account ownership

- Provider: Cloudflare R2, EU S3-compatible provider, or another named choice.
- Exact account and billing owner:
- EU-region/jurisdiction setting and creation proof:
- Who can rotate credentials and recover the account?
- Who owns provider incident response and retirement?
- Is a private bucket mandatory? (Recommended: yes.)

### 2. Privacy and legal basis

- Data controller and processor roles:
- Applicable DPA/terms accepted by the owner:
- Legal basis for images containing people, vehicles, private property, and
  location clues:
- Privacy-notice wording and publication date:
- Are user deletion and data-subject requests supported end to end?
- Are provider logs, support metadata, and edge metadata within the approved
  locality boundary?

### 3. Upload and read flow

- Direct browser upload to a presigned URL, or server/proxy upload?
- Maximum intent lifetime and replay protection:
- How is the intent bound to report, session, origin, and byte budget?
- How are magic bytes, image decoding, re-encoding, EXIF/GPS removal, and
  malware/content checks performed?
- Are approved reads served through a short-lived application proxy rather than
  a permanent public URL? (Recommended: yes.)

### 4. Moderation ownership

- Named moderation owner/team:
- Review SLA and escalation path:
- Quarantine states and audit events:
- What happens to rejected, abusive, illegal, or unsafe content?
- Is automated image classification advisory only, with human review for
  publication and safety-sensitive decisions? (Required: yes.)

### 5. Retention, deletion, and backups

- Quarantine retention period:
- Approved-derivative retention period:
- Rejected/failed-object deletion deadline:
- User-report deletion procedure for metadata, original, derivative, cache,
  backups, and audit references:
- Lifecycle-rule backstop and its maximum delay:
- Backup provider/retention and restore owner:
- Cache purge or short-read policy that prevents deleted images staying public:

### 6. Capacity and abuse budget

- Per-IP, per-session, per-report, and daily byte limits:
- Concurrent upload/decoding limit for the VPS:
- Moderation queue capacity and backpressure behaviour:
- Provider storage, request, egress, and lifecycle budget:
- Rate-limit and CSRF policy:
- Observability fields allowed in logs (never image bytes, EXIF, signed URLs,
  or bearer tokens):

## Approval record

| Field | Value |
| --- | --- |
| Decision owner | _pending_ |
| Provider and region | _pending_ |
| Account/billing owner | _pending_ |
| DPA/privacy review | _pending_ |
| Moderation owner | _pending_ |
| Upload flow | _pending_ |
| Retention/deletion policy | _pending_ |
| Backup/restore policy | _pending_ |
| Byte/rate budget | _pending_ |
| Privacy notice updated | _pending_ |
| Implementation approval date | _pending_ |
| Decision | **KEEP DISABLED** |

## Stop rule

Until every approval-record field is resolved and the related tests are
planned, keep the current JSON-only `/api/reports` contract and
`photoUrl: null`. Do not create a bucket, add a dependency, change Prisma, or
accept multipart data merely because a technical provider candidate exists.
