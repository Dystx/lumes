import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Provide a safe default for local development if DATABASE_URL is not set
// or points to a non-existent path (e.g. prod absolute path in committed .env).
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./db/custom.db'
}

// Query logging disabled — it was consuming all memory and crashing the server
// (every page load triggers 100+ SQL queries from incident persistence)
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db