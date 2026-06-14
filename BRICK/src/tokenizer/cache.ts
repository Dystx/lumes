import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { DesignTokens } from "../types";

interface CacheEntry {
  mtime: number;
  tokens: DesignTokens;
}

export class TokenCache {
  private path: string;
  private enabled: boolean;

  constructor(projectPath: string, enabled = true) {
    this.path = join(projectPath, ".slop-audit", "cache.json");
    this.enabled = enabled;
  }

  get(filePath: string): DesignTokens | undefined {
    if (!this.enabled) return undefined;
    try {
      const cache: Record<string, CacheEntry> = JSON.parse(readFileSync(this.path, "utf-8"));
      const entry = cache[this.key(filePath)];
      if (entry && statSync(filePath).mtimeMs === entry.mtime) {
        return entry.tokens;
      }
    } catch {}
    return undefined;
  }

  set(filePath: string, tokens: DesignTokens): void {
    if (!this.enabled) return;
    let cache: Record<string, CacheEntry> = {};
    try {
      cache = JSON.parse(readFileSync(this.path, "utf-8"));
    } catch {}
    cache[this.key(filePath)] = { mtime: statSync(filePath).mtimeMs, tokens };
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(cache, null, 2) + "\n");
  }

  private key(filePath: string): string {
    return createHash("sha256").update(filePath).digest("hex").slice(0, 16);
  }
}
