import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { TokenCache } from "../../src/tokenizer/cache";
import { DesignTokens } from "../../src/types";

const dummyTokens: DesignTokens = {
  spacing: [{ value: 4, unit: "px", raw: "4px" }],
  radii: [],
  fontSizes: [],
  colors: [],
  zIndex: [],
  shadows: [],
  lineHeights: [],
  letterSpacing: [],
  fontWeights: [],
  fontFamilies: [],
};

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "slop-audit-cache-"));
}

function writeFixture(dir: string, name: string, content = "export {}") {
  const filePath = join(dir, name);
  writeFileSync(filePath, content);
  return filePath;
}

describe("TokenCache", () => {
  it("returns undefined on cache miss", () => {
    const tmp = makeTempDir();
    try {
      mkdirSync(join(tmp, ".slop-audit"), { recursive: true });
      const filePath = writeFixture(tmp, "miss.css");
      const cache = new TokenCache(tmp);
      expect(cache.get(filePath)).toBeUndefined();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("returns cached tokens on cache hit", () => {
    const tmp = makeTempDir();
    try {
      mkdirSync(join(tmp, ".slop-audit"), { recursive: true });
      const filePath = writeFixture(tmp, "hit.css");
      const cache = new TokenCache(tmp);
      cache.set(filePath, dummyTokens);
      const hit = cache.get(filePath);
      expect(hit).toBeDefined();
      expect(hit?.spacing).toEqual(dummyTokens.spacing);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("returns undefined when disabled", () => {
    const tmp = makeTempDir();
    try {
      mkdirSync(join(tmp, ".slop-audit"), { recursive: true });
      const filePath = writeFixture(tmp, "disabled.css");
      const cache = new TokenCache(tmp, false);
      cache.set(filePath, dummyTokens);
      expect(cache.get(filePath)).toBeUndefined();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
