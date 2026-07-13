import { PrismaClient } from '@prisma/client'
import { resolveDatabaseUrl } from './database-url'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Provide a safe local fallback if DATABASE_URL is unset or points to a stale
// machine-specific path. Prisma resolves relative SQLite URLs from `prisma/`.
process.env.DATABASE_URL = resolveDatabaseUrl({
  configuredUrl: process.env.DATABASE_URL,
  cwd: process.cwd(),
});

// Query logging disabled — it was consuming all memory and crashing the server
// (every page load triggers 100+ SQL queries from incident persistence)
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
