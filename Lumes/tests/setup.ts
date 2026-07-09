// Vitest global setup — runs before every test file.
//
// Goals:
//   - Default DATABASE_URL to a per-test-temp SQLite file (so tests
//     don't accidentally read or write to the production database).
//   - Skip Prisma client initialization if the DB hasn't been pushed.
//
// The actual schema is created once per test process by tests/setup.

import { afterAll, beforeAll } from "vitest";
import { execFileSync, execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const tmp = mkdtempSync(path.join(tmpdir(), "lumes-test-"));
process.env.DATABASE_URL = `file:${path.join(tmp, "test.db")}`;
(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const testDatabasePath = path.join(tmp, "test.db");

/**
 * Prisma's schema engine is unavailable in some Bun/macOS environments even
 * though Prisma's query engine remains functional. Keep database-backed unit
 * tests meaningful by creating the two persistence tables they exercise.
 * Production schema changes must still be applied through Prisma.
 */
function createPersistenceTestSchema(): void {
  // The fallback deliberately uses the system SQLite CLI rather than a
  // JavaScript driver so Vitest remains executable under both Node and Bun.
  execFileSync("sqlite3", [testDatabasePath], {
    input: `
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS "Incident" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "sourceId" TEXT NOT NULL,
        "sourceInternalId" TEXT NOT NULL,
        "displayName" TEXT NOT NULL,
        "eventType" TEXT NOT NULL,
        "status" TEXT NOT NULL,
        "severity" TEXT NOT NULL,
        "latitude" REAL NOT NULL,
        "longitude" REAL NOT NULL,
        "estimatedAreaHa" REAL NOT NULL DEFAULT 0,
        "municipality" TEXT,
        "parish" TEXT,
        "district" TEXT,
        "personnelTotal" INTEGER NOT NULL DEFAULT 0,
        "assetsGround" INTEGER NOT NULL DEFAULT 0,
        "assetsAerial" INTEGER NOT NULL DEFAULT 0,
        "confidence" REAL NOT NULL DEFAULT 0.9,
        "rasi" TEXT,
        "naturezaText" TEXT,
        "statusText" TEXT,
        "firstSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "lastSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "firstDetected" DATETIME NOT NULL,
        "lastUpdated" DATETIME NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL
      );
      CREATE TABLE IF NOT EXISTS "IncidentSnapshot" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "incidentId" TEXT NOT NULL,
        "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "status" TEXT NOT NULL,
        "severity" TEXT NOT NULL,
        "personnelTotal" INTEGER NOT NULL DEFAULT 0,
        "assetsGround" INTEGER NOT NULL DEFAULT 0,
        "assetsAerial" INTEGER NOT NULL DEFAULT 0,
        "estimatedAreaHa" REAL NOT NULL DEFAULT 0,
        "statusText" TEXT,
        "note" TEXT,
        CONSTRAINT "IncidentSnapshot_incidentId_fkey"
          FOREIGN KEY ("incidentId") REFERENCES "Incident" ("id")
          ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE INDEX IF NOT EXISTS "IncidentSnapshot_incidentId_timestamp_idx"
        ON "IncidentSnapshot" ("incidentId", "timestamp");
    `,
    encoding: "utf8",
  });
}

beforeAll(() => {
  try {
    execSync("bunx prisma db push --skip-generate --accept-data-loss", {
      stdio: "ignore",
      env: { ...process.env },
    });
  } catch (e) {
    createPersistenceTestSchema();
    console.warn("[tests/setup] Prisma schema engine unavailable; using the persistence test schema fallback");
  }
});

afterAll(() => {
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    // best-effort
  }
});
