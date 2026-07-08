// Incident persistence service — upserts ANEPC incidents into Prisma,
// creates snapshots on state changes, tracks firstSeen/lastSeen

import { db } from "@/lib/db";
import type { LiveIncident } from "@/lib/types";

export interface PersistenceResult {
  upserted: number;
  created: number;
  updated: number;
  snapshotsCreated: number;
  errors: string[];
}

export async function persistIncidents(
  incidents: LiveIncident[]
): Promise<PersistenceResult> {
  const result: PersistenceResult = {
    upserted: 0,
    created: 0,
    updated: 0,
    snapshotsCreated: 0,
    errors: [],
  };

  const now = new Date();
  const seenIds = new Set<string>();

  for (const inc of incidents) {
    try {
      seenIds.add(inc.id);
      const firstDetected = new Date(inc.observedAt);
      const lastUpdated = new Date(inc.lastUpdated || inc.observedAt);

      // Check if incident already exists
      const existing = await db.incident.findUnique({
        where: { id: inc.id },
        include: { snapshots: { orderBy: { timestamp: "desc" }, take: 1 } },
      });

      if (!existing) {
        // Create new incident
        await db.incident.create({
          data: {
            id: inc.id,
            sourceId: inc.sourceId,
            sourceInternalId: inc.sourceInternalId,
            displayName: inc.displayName,
            eventType: inc.eventType,
            status: inc.incidentStatus,
            severity: inc.severity,
            latitude: inc.geometry.coordinates[1],
            longitude: inc.geometry.coordinates[0],
            estimatedAreaHa: inc.estimatedAreaHa,
            municipality: inc.properties.municipality || null,
            parish: inc.properties.parish || null,
            district: inc.properties.region || null,
            personnelTotal: inc.properties.personnelTotal || 0,
            assetsGround: inc.properties.assetsGround || 0,
            assetsAerial: inc.properties.assetsAerial || 0,
            confidence: inc.trust.confidence,
            rasi: inc.properties.rasi || null,
            naturezaText: inc.properties.naturezaText || null,
            statusText: inc.properties.statusText || null,
            firstSeen: now,
            lastSeen: now,
            firstDetected,
            lastUpdated,
            snapshots: {
              create: {
                status: inc.incidentStatus,
                severity: inc.severity,
                personnelTotal: inc.properties.personnelTotal || 0,
                assetsGround: inc.properties.assetsGround || 0,
                assetsAerial: inc.properties.assetsAerial || 0,
                estimatedAreaHa: inc.estimatedAreaHa,
                statusText: inc.properties.statusText || null,
                note: "Incident first detected",
              },
            },
          },
        });
        result.created++;
        result.snapshotsCreated++;
      } else {
        // Check if state has changed
        const stateChanged =
          existing.status !== inc.incidentStatus ||
          existing.severity !== inc.severity ||
          existing.personnelTotal !== (inc.properties.personnelTotal || 0) ||
          existing.assetsAerial !== (inc.properties.assetsAerial || 0) ||
          existing.assetsGround !== (inc.properties.assetsGround || 0);

        // Update existing incident
        await db.incident.update({
          where: { id: inc.id },
          data: {
            displayName: inc.displayName,
            status: inc.incidentStatus,
            severity: inc.severity,
            personnelTotal: inc.properties.personnelTotal || 0,
            assetsGround: inc.properties.assetsGround || 0,
            assetsAerial: inc.properties.assetsAerial || 0,
            confidence: inc.trust.confidence,
            statusText: inc.properties.statusText || null,
            lastSeen: now,
            lastUpdated,
            updatedAt: now,
          },
        });
        result.updated++;

        // Create snapshot if state changed
        if (stateChanged) {
          const lastSnapshot = existing.snapshots[0];
          const changes: string[] = [];
          if (existing.status !== inc.incidentStatus)
            changes.push(`Status: ${existing.status} → ${inc.incidentStatus}`);
          if (existing.severity !== inc.severity)
            changes.push(`Severity: ${existing.severity} → ${inc.severity}`);
          if (existing.personnelTotal !== (inc.properties.personnelTotal || 0))
            changes.push(`Personnel: ${existing.personnelTotal} → ${inc.properties.personnelTotal || 0}`);
          if (existing.assetsAerial !== (inc.properties.assetsAerial || 0))
            changes.push(`Aircraft: ${existing.assetsAerial} → ${inc.properties.assetsAerial || 0}`);

          await db.incidentSnapshot.create({
            data: {
              incidentId: inc.id,
              status: inc.incidentStatus,
              severity: inc.severity,
              personnelTotal: inc.properties.personnelTotal || 0,
              assetsGround: inc.properties.assetsGround || 0,
              assetsAerial: inc.properties.assetsAerial || 0,
              estimatedAreaHa: inc.estimatedAreaHa,
              statusText: inc.properties.statusText || null,
              note: changes.join("; ") || "State update",
            },
          });
          result.snapshotsCreated++;
        }
      }
      result.upserted++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`${inc.id}: ${msg}`);
    }
  }

  // Mark incidents not seen in this fetch as potentially resolved
  // (only if they were active/contained and haven't been seen in 2+ hours)
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const staleIncidents = await db.incident.findMany({
    where: {
      lastSeen: { lt: twoHoursAgo },
      status: { in: ["detected", "active", "contained"] },
    },
  });

  for (const stale of staleIncidents) {
    if (!seenIds.has(stale.id)) {
      await db.incident.update({
        where: { id: stale.id },
        data: {
          status: "resolved",
          updatedAt: now,
        },
      });
      await db.incidentSnapshot.create({
        data: {
          incidentId: stale.id,
          status: "resolved",
          severity: stale.severity,
          personnelTotal: stale.personnelTotal,
          assetsGround: stale.assetsGround,
          assetsAerial: stale.assetsAerial,
          estimatedAreaHa: stale.estimatedAreaHa,
          note: "Auto-resolved: not seen in ANEPC data for 2+ hours",
        },
      });
      result.snapshotsCreated++;
    }
  }

  return result;
}

// Get incident timeline (snapshots) from the database
export async function getIncidentTimeline(incidentId: string) {
  const snapshots = await db.incidentSnapshot.findMany({
    where: { incidentId },
    orderBy: { timestamp: "asc" },
  });
  return snapshots;
}

// Get all persisted incidents (for history view)
export async function getPersistedIncidents(opts?: {
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const where = opts?.status ? { status: opts.status } : {};
  const incidents = await db.incident.findMany({
    where,
    orderBy: { lastSeen: "desc" },
    take: opts?.limit || 100,
    skip: opts?.offset || 0,
  });
  return incidents;
}

// Get persistence stats
export async function getPersistenceStats() {
  const [total, active, resolved, snapshots] = await Promise.all([
    db.incident.count(),
    db.incident.count({ where: { status: { in: ["detected", "active", "contained"] } } }),
    db.incident.count({ where: { status: "resolved" } }),
    db.incidentSnapshot.count(),
  ]);
  return { total, active, resolved, snapshots };
}
