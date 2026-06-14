import type { Category, SlopAuditConfig, Strictness } from "../types.js";

const FRAMEWORKS = ["react", "vue", "svelte", "solid"] as const;
const STYLING = [
  "tailwind",
  "css-modules",
  "styled-components",
  "emotion",
  "plain",
] as const;
const ARBITRARY_TOLERANCE = ["strict", "balanced", "permissive"] as const;
const STRICTNESS = ["brutal", "balanced", "gentle"] as const;
const CATEGORIES: Category[] = [
  "visual",
  "typography",
  "spacing",
  "component",
  "logic",
  "architecture",
];

export const defaultConfig: SlopAuditConfig = {
  framework: "react",
  styling: "tailwind",
  uiLibrary: "shadcn/ui",
  baseSpacing: 4,
  typeScaleRatio: 1.2,
  arbitraryTolerance: "balanced",
  strictness: "balanced",
  include: [
    "src/**/*",
    "app/**/*",
    "pages/**/*",
    "components/**/*",
    "**/*.vue",
    "**/*.svelte",
  ],
  exclude: [
    "**/node_modules/**",
    "**/*.test.{ts,tsx,js,jsx}",
    "**/*.stories.{ts,tsx}",
    "**/.next/**",
    "**/dist/**",
    "**/build/**",
    "**/coverage/**",
  ],
  legacyPaths: [],
  allowedArbitraryPaths: [],
  componentRegistry: {
    button: ["Button"],
    input: ["Input"],
    dialog: ["Dialog"],
    card: ["Card"],
    select: ["Select"],
    badge: ["Badge"],
  },
  disabledRules: [],
  bannedDefaults: true,
  projectMemory: true,
  categoryThresholds: {
    visual: 0.35,
    typography: 0.35,
    spacing: 0.35,
    component: 0.35,
    logic: 0.5,
    architecture: 0.5,
  },
  rules: {
    maxUseEffectPerComponent: 3,
    maxComponentLines: 500,
    maxJsxNestingDepth: 6,
    maxDirectChildren: 10,
    maxProps: 10,
    contrastMethod: "wcag2",
    contrastTarget: 4.5,
  },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeDeep<T extends Record<string, unknown>>(
  base: T,
  override: Record<string, unknown>
): T {
  const result = { ...base } as Record<string, unknown>;
  for (const key of Object.keys(override)) {
    const overrideValue = override[key];
    const baseValue = result[key];
    if (isPlainObject(overrideValue) && isPlainObject(baseValue)) {
      result[key] = mergeDeep(baseValue, overrideValue);
    } else {
      result[key] = overrideValue;
    }
  }
  return result as T;
}

function assertArrayOfStrings(
  value: unknown,
  name: string
): asserts value is string[] {
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
    throw new Error(`${name} must be an array of strings`);
  }
}

function assertStringEnum<T extends readonly string[]>(
  value: unknown,
  name: string,
  allowed: T
): asserts value is T[number] {
  if (!allowed.includes(value as string)) {
    throw new Error(
      `Invalid ${name}: ${String(value)}. Allowed: ${allowed.join(", ")}`
    );
  }
}

export function validateConfig(partial: unknown): SlopAuditConfig {
  if (!isPlainObject(partial)) {
    throw new Error("Config must be an object");
  }

  const merged = mergeDeep(
    structuredClone(defaultConfig) as unknown as Record<string, unknown>,
    partial
  );

  assertStringEnum(merged.framework, "framework", FRAMEWORKS);
  assertStringEnum(merged.styling, "styling", STYLING);
  assertStringEnum(
    merged.arbitraryTolerance,
    "arbitraryTolerance",
    ARBITRARY_TOLERANCE
  );
  assertStringEnum(merged.strictness, "strictness", STRICTNESS);

  if (
    typeof merged.baseSpacing !== "number" ||
    !Number.isFinite(merged.baseSpacing) ||
    merged.baseSpacing <= 0
  ) {
    throw new Error("baseSpacing must be a positive number");
  }

  if (
    merged.typeScaleRatio !== undefined &&
    (typeof merged.typeScaleRatio !== "number" ||
      !Number.isFinite(merged.typeScaleRatio) ||
      merged.typeScaleRatio <= 0)
  ) {
    throw new Error("typeScaleRatio must be a positive number");
  }

  assertArrayOfStrings(merged.include, "include");
  assertArrayOfStrings(merged.exclude, "exclude");

  if (merged.legacyPaths !== undefined) {
    assertArrayOfStrings(merged.legacyPaths, "legacyPaths");
  }
  if (merged.allowedArbitraryPaths !== undefined) {
    assertArrayOfStrings(merged.allowedArbitraryPaths, "allowedArbitraryPaths");
  }

  if (
    !isPlainObject(merged.componentRegistry) ||
    Object.values(merged.componentRegistry).some(
      (v) => !Array.isArray(v) || v.some((x) => typeof x !== "string")
    )
  ) {
    throw new Error("componentRegistry must be a Record<string, string[]>");
  }

  if (merged.disabledRules !== undefined) {
    assertArrayOfStrings(merged.disabledRules, "disabledRules");
  }

  if (typeof merged.bannedDefaults !== "boolean") {
    throw new Error("bannedDefaults must be a boolean");
  }
  if (typeof merged.projectMemory !== "boolean") {
    throw new Error("projectMemory must be a boolean");
  }

  if (!isPlainObject(merged.categoryThresholds)) {
    throw new Error("categoryThresholds must be an object");
  }
  for (const category of CATEGORIES) {
    const threshold = (merged.categoryThresholds as Record<string, unknown>)[
      category
    ];
    if (
      typeof threshold !== "number" ||
      !Number.isFinite(threshold) ||
      threshold < 0 ||
      threshold > 1
    ) {
      throw new Error(
        `categoryThresholds.${category} must be a number between 0 and 1`
      );
    }
  }

  const rules = merged.rules;
  if (!isPlainObject(rules)) {
    throw new Error("rules must be an object");
  }
  for (const key of [
    "maxUseEffectPerComponent",
    "maxComponentLines",
    "maxJsxNestingDepth",
    "maxDirectChildren",
    "maxProps",
    "contrastTarget",
  ] as const) {
    const v = rules[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
      throw new Error(`rules.${key} must be a positive number`);
    }
  }
  assertStringEnum(rules.contrastMethod, "rules.contrastMethod", [
    "wcag2",
    "wcag3",
    "apca",
  ]);

  return merged as unknown as SlopAuditConfig;
}
