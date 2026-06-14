import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { defaultConfig, validateConfig } from "./schema.js";
import type { SlopAuditConfig } from "../types.js";

export function resolveConfigPath(
  projectPath: string,
  customPath?: string
): string {
  if (customPath) {
    return isAbsolute(customPath) ? customPath : join(projectPath, customPath);
  }
  return join(projectPath, ".slop-audit.json");
}

export function loadConfig(
  projectPath: string,
  customPath?: string
): SlopAuditConfig {
  const path = resolveConfigPath(projectPath, customPath);

  if (!existsSync(path)) {
    if (customPath) {
      throw new Error(`Config file not found: ${path}`);
    }
    return structuredClone(defaultConfig);
  }

  const raw = readFileSync(path, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Invalid JSON in ${path}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return validateConfig(parsed);
}

export function saveConfig(
  projectPath: string,
  config: SlopAuditConfig
): void {
  const path = join(projectPath, ".slop-audit.json");
  const serialized = JSON.stringify(config, null, 2) + "\n";
  writeFileSync(path, serialized, "utf-8");
}
