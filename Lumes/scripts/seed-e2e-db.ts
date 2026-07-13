import { PrismaClient } from "@prisma/client";

if (process.env.LUMES_E2E_SEED !== "1") {
  throw new Error("Refusing to seed a database without LUMES_E2E_SEED=1");
}

if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to seed an e2e database in production");
}

const db = new PrismaClient();
const now = new Date();

try {
  await db.incident.upsert({
    where: { id: "e2e-incident-1" },
    update: {
      lastSeen: now,
      lastUpdated: now,
      status: "active",
    },
    create: {
      id: "e2e-incident-1",
      sourceId: "e2e-fixture",
      sourceInternalId: "e2e-incident-1",
      displayName: "E2E Test Incident",
      eventType: "wildfire",
      status: "active",
      severity: "high",
      latitude: 39.5,
      longitude: -8,
      estimatedAreaHa: 1,
      municipality: "Santarém",
      parish: "E2E",
      district: "Santarém",
      personnelTotal: 8,
      assetsGround: 2,
      assetsAerial: 0,
      confidence: 1,
      firstDetected: now,
      lastUpdated: now,
      firstSeen: now,
      lastSeen: now,
    },
  });
  console.log("E2E database seeded with one incident");
} finally {
  await db.$disconnect();
}
