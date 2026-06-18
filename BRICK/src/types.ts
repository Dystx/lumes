export const VERSION = '1.0.0';

export type Severity = 'low' | 'medium' | 'high';

export type RuleSeverity = Severity | 'auto';

export type Category =
  | 'visual'
  | 'typo'
  | 'wcag'
  | 'layout'
  | 'component'
  | 'logic'
  | 'arch'
  | 'perf';

export interface FixSuggestion {
  kind: 'insert' | 'replace' | 'css-anchor';
  description: string;
  targetFile?: string;
  anchor?: string;
  oldValue?: string;
  newValue?: string;
}

export interface Issue {
  ruleId: string;
  category: Category;
  severity: Severity;
  aiSpecific: boolean;
  filePath?: string;
  message: string;
  line: number;
  column: number;
  advice?: string;
  fix?: FixSuggestion;
  fixes?: FixSuggestion[];
}

export interface ClassNameFact {
  value: string;
  line: number;
  column: number;
}

export interface ElementFact {
  tag: string;
  attributes: Record<string, string | undefined>;
  classNames: ClassNameFact[];
  line: number;
  column: number;
}

export interface HookFact {
  name: string;
  line: number;
  column: number;
}

export interface StateBinding {
  valueName?: string;
  setterName?: string;
  line: number;
  column: number;
  valueReferenced: boolean;
  setterReferenced: boolean;
}

export interface ComponentFacts {
  name?: string;
  line: number;
  column: number;
  isServerComponent: boolean;
  hookCalls: HookFact[];
  stateBindings: StateBinding[];
}

export interface LogicalExpressionFact {
  depth: number;
  line: number;
  column: number;
  text: string;
  isOptionalChainLike: boolean;
}

export interface StylePropFact {
  source: string;
  line: number;
  column: number;
}

export interface AstroComponentFact {
  tag: string;
  hasClientDirective: boolean;
  hasEventHandler: boolean;
  line: number;
  column: number;
}

export interface ConsoleCallFact {
  method: 'log' | 'warn' | 'error' | 'info' | 'debug';
  line: number;
  column: number;
}

export interface StringLiteralFact {
  value: string;
  line: number;
  column: number;
}

export interface ScanFacts {
  filePath: string;
  astNodeCount: number;
  components: ComponentFacts[];
  staticClassNames: ClassNameFact[];
  interactiveElements: ElementFact[];
  allElements: ElementFact[];
  imageElements: ElementFact[];
  imports: ImportFact[];
  hooks: HookFact[];
  logicalExpressions: LogicalExpressionFact[];
  styleProps: StylePropFact[];
  astroComponents: AstroComponentFact[];
  consoleCalls: ConsoleCallFact[];
  stringLiterals: StringLiteralFact[];
}

export interface ImportFact {
  source: string;
  line: number;
  column: number;
  importedNames?: string[];
}

export interface FileScanResult {
  filePath: string;
  componentCount: number;
  astNodeCount: number;
  issues: Issue[];
  parseError?: string;
  gapValues?: string[];
  gapContainerCount?: number;
  styleSources?: string[];
  elementTags?: string[];
}

export interface ComponentScore {
  filePath: string;
  rawScore: number;
  componentScore: number;
  adjustedScore: number;
  componentCount: number;
}

export interface BaselineMeta {
  active: boolean;
  version: string;
  baselineRevision: number;
  createdAt: string;
}

export interface ProjectReport {
  version: string;
  generatedAt: string;
  configPath?: string;
  slopIndex: number;
  assemblyHealth: number;
  categoryScores: Record<Category, number>;
  p90Score: number;
  peakScore: number;
  componentCount: number;
  fileCount?: number;
  components: ComponentScore[];
  issues: Issue[];
  parseErrors?: Array<{ filePath: string; error: string }>;
  baseline?: BaselineMeta;
  thresholds?: { meanSlop: number; p90Slop: number; individualSlopThreshold: number };
}

export interface BaselineCache {
  version: string;
  config_hash: string;
  git_head: string;
  baseline_created: string;
  baseline_revision: number;
  totalComponentCount: number;
  scores: Record<string, { baselineScore: number; componentCount: number }>;
}

export interface SlopAuditRun {
  timestamp: string;
  version: string;
  slopIndex: number;
  categoryScores: Record<Category, number>;
  topOffenseIds: string[];
  thresholdExceeded: boolean;
}

export interface RuleContext {
  config: ResolvedConfig;
  filePath: string;
  cwd: string;
}

export interface Rule<Context = unknown> {
  id: string;
  category: Category;
  severity: Severity;
  aiSpecific: boolean;
  create(context: RuleContext): Context;
  analyze(context: Context, facts: ScanFacts): Issue[];
}

export interface ResolvedConfig {
  framework?: string;
  hasTailwind?: boolean;
  supportsRsc?: boolean;
  include: string[];
  exclude: string[];
  rules: Record<string, RuleSeverity | 'off'>;
  categoryWeights?: Record<Category, number>;
  frameworkMultipliers: Record<string, number>;
  ruleConfig: Record<string, unknown>;
  gapTokens?: string[];
  contextTaxCaps: { cleanCap: number; standardCap: number };
  globalCssTarget?: string;
  projectMemory?: boolean;
  telemetry?: boolean;
  thresholds: {
    meanSlop: number;
    p90Slop: number;
    individualSlopThreshold: number;
  };
  spacingScale?: number[];
  typographyScale?: string[];
  arbitraryValueAllowlist: (string | RegExp)[];
  clampAllowlist?: (string | RegExp)[];
  wcag: {
    targetSizeExemptSelectors: string[];
    targetSizeRequireTailwind?: boolean;
  };
}
