// scripts/import-sqlite-to-postgres.ts
//
// One-shot migration: copy data from the local SQLite database
// (default: db/custom.db) into the Postgres database pointed at
// by $DATABASE_URL.
//
// Usage:
//
//   DATABASE_URL='postgres://user:pass@host/db?sslmode=require' \
//     bun scripts/import-sqlite-to-postgres.ts
//
//   # or point at a non-default SQLite file:
//   SQLITE_PATH=/some/where/custom.db \
//     DATABASE_URL='...' bun scripts/import-sqlite-to-postgres.ts
//
// Behaviour:
//
// * Idempotent — uses `createMany({ skipDuplicates: true })`. Re-runs
//   are safe and add only missing rows.
// * Tables are imported in FK-safe order.
// * Date columns are normalised (SQLite stores them as ISO strings
//   or unix epoch numbers depending on writer; we accept both).
// * Reads SQLite via `bun:sqlite` (built into Bun), writes via Prisma.
//   No new runtime dependencies required.
//
// Reference (sqlite -> postgres) table list is derived from the
// production models in prisma/schema.prisma; the boilerplate
// `User` / `Post` models are intentionally skipped.

import { Database } from "bun:sqlite";
import { PrismaClient } from "@prisma/client";

const SQLITE_PATH = process.env.SQLITE_PATH ?? "db/custom.db";

const TABLES = [
  { table: "Incident", model: "incident", dateCols: ["firstSeen", "lastSeen", "firstDetected", "lastUpdated", "createdAt", "updatedAt"] },
  { table: "IncidentSnapshot", model: "incidentSnapshot", dateCols: ["timestamp"] },
  { table: "FollowedIncident", model: "followedIncident", dateCols: ["followedAt"] },
  { table: "CommunityReport", model: "communityReport", dateCols: ["submittedAt", "reviewedAt"] },
  { table: "AlertSubscription", model: "alertSubscription", dateCols: ["createdAt"] },
] as const;

function parseDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "number") {
    // SQLite writers vary: some store unix seconds, others ms.
    // Heuristic: values < 1e12 are seconds (well below any plausible
    // modern ms timestamp), otherwise treat as ms.
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function normaliseRow(row: Record<string, unknown>, dateCols: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const col of dateCols) {
    if (col in out) out[col] = parseDate(out[col]);
  }
  return out;
}

async function importOne(pg: PrismaClient, sqlite: Database, spec: typeof TABLES[number]): Promise<void> {
  const { table, model, dateCols } = spec;
  // Bun's SQLite driver returns column names exactly as stored.
  // Prisma created both DBs with the same schema, so column names
  // match the model's createMany input shape.
  const rows = sqlite.query(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[];
  if (rows.length === 0) {
    console.log(`[skip] ${table}: 0 rows`);
    return;
  }
  const data = rows.map((r) => normaliseRow(r, dateCols));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delegate = (pg as any)[model];
  if (!delegate?.createMany) {
    throw new Error(`Prisma model "${model}" not found on client`);
  }
  const result = await delegate.createMany({ data, skipDuplicates: true });
  console.log(`[ok]   ${table}: ${result.count} inserted, ${data.length} read (${data.length - result.count} duplicates skipped)`);
}

async function main(): Promise<void> {
  const sqlite = new Database(SQLITE_PATH, { readonly: true });
  const pg = new PrismaClient();

  console.log(`Reading from SQLite: ${SQLITE_PATH}`);
  console.log(`Writing to Postgres: ${process.env.DATABASE_URL?.replace(/:[^:@/]+@/, ":***@") ?? "(unset!)"}`);

  try {
    for (const spec of TABLES) {
      await importOne(pg, sqlite, spec);
    }
  } finally {
    sqlite.close();
    await pg.$disconnect();
  }
}

main().catch((err) => {
  console.error("[fail]", err);
  process.exit(1);
});
