import fs from "node:fs";
import path from "node:path";

export interface DatabaseUrlOptions {
  configuredUrl?: string;
  cwd: string;
  fileExists?: (filePath: string) => boolean;
}

/**
 * Prisma resolves relative SQLite URLs from the schema directory, not the
 * application root. Keep local development on the repository's real database
 * when an inherited `.env` points at a stale or machine-specific path.
 */
export function resolveDatabaseUrl({
  configuredUrl,
  cwd,
  fileExists = fs.existsSync,
}: DatabaseUrlOptions): string {
  const fallbackUrl = `file:${path.resolve(cwd, "db", "custom.db")}`;
  if (!configuredUrl) return fallbackUrl;
  if (!configuredUrl.startsWith("file:")) return configuredUrl;

  const configuredPath = configuredUrl.slice("file:".length).split("?")[0];
  const resolvedPath = path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(cwd, "prisma", configuredPath);

  return fileExists(resolvedPath) ? configuredUrl : fallbackUrl;
}
