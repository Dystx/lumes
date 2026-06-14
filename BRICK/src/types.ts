export type Severity = "critical" | "high" | "medium" | "low";
export type Strictness = "brutal" | "balanced" | "gentle";
export type Category =
  | "visual"
  | "typography"
  | "spacing"
  | "component"
  | "logic"
  | "architecture";

export interface Issue {
  ruleId: string;
  category: Category;
  severity: Severity;
  message: string;
  line: number;
  column: number;
  advice?: string;
}

export interface ComponentReport {
  file: string;
  name: string;
  line: number;
  slopIndex: number;
  issues: Issue[];
}

export interface SlopAuditReport {
  version: string;
  generatedAt: string;
  configPath?: string;
  slopIndex: number;
  categoryScores: Record<Category, number>;
  components: ComponentReport[];
  topOffenses: Issue[];
  advice: string[];
  ignoredIssues: number;
  unscannedFiles: string[];
}

export interface TokenValue {
  value: number;
  unit: "px" | "rem" | "em";
  raw: string;
}

export interface ColorToken {
  name: string;
  raw: string;
  hex?: string;
  oklch?: string;
}

export interface DesignTokens {
  spacing: TokenValue[];
  radii: TokenValue[];
  fontSizes: TokenValue[];
  colors: ColorToken[];
  zIndex: number[];
  shadows: string[];
  lineHeights: number[];
  letterSpacing: number[];
  fontWeights: number[];
  fontFamilies: string[];
}

export interface SlopAuditConfig {
  framework: "react" | "vue" | "svelte" | "solid";
  styling: "tailwind" | "css-modules" | "styled-components" | "emotion" | "plain";
  uiLibrary?: string;
  baseSpacing: number;
  typeScaleRatio?: number;
  arbitraryTolerance: "strict" | "balanced" | "permissive";
  strictness: Strictness;
  include: string[];
  exclude: string[];
  legacyPaths?: string[];
  allowedArbitraryPaths?: string[];
  componentRegistry: Record<string, string[]>;
  disabledRules?: string[];
  bannedDefaults: boolean;
  projectMemory: boolean;
  categoryThresholds: Record<Category, number>;
  corpusVersion?: string;
  rules: {
    maxUseEffectPerComponent: number;
    maxComponentLines: number;
    maxJsxNestingDepth: number;
    maxDirectChildren: number;
    maxProps: number;
    contrastMethod: "wcag2" | "wcag3" | "apca";
    contrastTarget: number;
  };
}
