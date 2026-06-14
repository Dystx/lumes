export type {
  Category,
  Severity,
  Strictness,
  TokenValue,
  ColorToken,
  DesignTokens,
  Issue,
  ComponentReport,
  SlopAuditReport,
  SlopAuditConfig,
} from "./types";

export { defaultConfig, validateConfig } from "./config/schema";
export { loadConfig, saveConfig } from "./config/loader";
export { runWizard } from "./config/wizard";
export { TokenCache } from "./tokenizer/cache";
export { extractDesignTokens } from "./tokenizer";
export { createProject } from "./extractor/project";
export { extractComponents } from "./extractor/component";
export { runDetectors } from "./detectors";
export { scoreComponent, scoreProject, SEVERITY_WEIGHTS } from "./scorer";
export { renderTerminal } from "./reporter/terminal";
export { renderJson } from "./reporter/json";
export { renderBadge } from "./reporter/badge";
export { appendRun, readLastRun, renderTrend } from "./memory/log";
