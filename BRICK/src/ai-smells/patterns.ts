import type { Category, Severity } from "../types.js";
import bannedDefaults from "../../rules/banned-defaults.json" with { type: "json" };

export interface BannedDefaultsPatterns {
  classNames?: string[];
  fontFamily?: string[];
  pageStructure?: string[];
}

export interface BannedDefaultsRule {
  id: string;
  message: string;
  category: Category;
  severity: Severity;
  patterns: BannedDefaultsPatterns;
}

export interface BannedDefaultsRulePack {
  version: string;
  rules: BannedDefaultsRule[];
}

export function loadBannedDefaults(): BannedDefaultsRulePack {
  return bannedDefaults as BannedDefaultsRulePack;
}
