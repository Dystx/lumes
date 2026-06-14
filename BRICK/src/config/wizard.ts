import type { SlopAuditConfig, Strictness } from "../types.js";
import { defaultConfig } from "./schema.js";

export interface WizardPrompts {
  select: (config: {
    message: string;
    name?: string;
    choices: { name: string; value: string }[];
    default?: string;
  }) => Promise<string>;
  input: (config: {
    message: string;
    name?: string;
    default?: string;
  }) => Promise<string>;
  number: (config: {
    message: string;
    name?: string;
    default?: number;
  }) => Promise<number>;
}

function includeForScanChoice(choice: string, customGlobs?: string): string[] {
  switch (choice) {
    case "src":
      return ["src/**/*"];
    case "app":
      return ["app/**/*"];
    case "custom":
      return customGlobs
        ? customGlobs
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : ["src/**/*"];
    case "auto":
    default:
      return defaultConfig.include;
  }
}

export function isCancelError(err: unknown): err is Error {
  return err instanceof Error && err.name === "ExitPromptError";
}

export async function runWizard(
  prompts?: WizardPrompts
): Promise<SlopAuditConfig> {
  const p =
    prompts ??
    ((await import("@inquirer/prompts")) as unknown as WizardPrompts);

  const framework = (await p.select({
    name: "framework",
    message: "Framework:",
    choices: [
      { name: "React", value: "react" },
      { name: "Vue", value: "vue" },
      { name: "Svelte", value: "svelte" },
      { name: "Solid", value: "solid" },
    ],
    default: "react",
  })) as SlopAuditConfig["framework"];

  const styling = (await p.select({
    name: "styling",
    message: "Styling solution:",
    choices: [
      { name: "Tailwind", value: "tailwind" },
      { name: "CSS Modules", value: "css-modules" },
      { name: "Styled Components", value: "styled-components" },
      { name: "Emotion", value: "emotion" },
      { name: "Plain CSS", value: "plain" },
    ],
    default: "tailwind",
  })) as SlopAuditConfig["styling"];

  const uiLibrary = await p.select({
    name: "uiLibrary",
    message: "UI library / design system:",
    choices: [
      { name: "shadcn/ui", value: "shadcn/ui" },
      { name: "Material UI", value: "Material UI" },
      { name: "Ant Design", value: "Ant Design" },
      { name: "Chakra UI", value: "Chakra UI" },
      { name: "Radix Themes", value: "Radix Themes" },
      { name: "Custom", value: "Custom" },
      { name: "None", value: "None" },
    ],
    default: "shadcn/ui",
  });

  const baseSpacing = await p.number({
    name: "baseSpacing",
    message: "Base spacing grid (px):",
    default: 4,
  });

  const typeScaleRatioRaw = await p.input({
    name: "typeScaleRatio",
    message: "Type scale ratio (e.g. 1.2):",
    default: "1.2",
  });

  const arbitraryTolerance = (await p.select({
    name: "arbitraryTolerance",
    message: "Arbitrary value tolerance:",
    choices: [
      { name: "Strict", value: "strict" },
      { name: "Balanced", value: "balanced" },
      { name: "Permissive", value: "permissive" },
    ],
    default: "balanced",
  })) as SlopAuditConfig["arbitraryTolerance"];

  const scanPaths = await p.select({
    name: "scanPaths",
    message: "Paths to scan:",
    choices: [
      { name: "Auto (src / app / pages / components)", value: "auto" },
      { name: "src/", value: "src" },
      { name: "app/", value: "app" },
      { name: "Custom", value: "custom" },
    ],
    default: "auto",
  });

  let customGlobs: string | undefined;
  if (scanPaths === "custom") {
    customGlobs = await p.input({
      name: "customGlobs",
      message: "Custom glob patterns (comma-separated):",
      default: "src/**/*",
    });
  }

  const strictness = (await p.select({
    name: "strictness",
    message: "Strictness:",
    choices: [
      { name: "Brutal", value: "brutal" },
      { name: "Balanced", value: "balanced" },
      { name: "Gentle", value: "gentle" },
    ],
    default: "balanced",
  })) as Strictness;

  const typeScaleRatio = parseFloat(typeScaleRatioRaw);

  return {
    ...defaultConfig,
    framework,
    styling,
    uiLibrary,
    baseSpacing,
    typeScaleRatio: Number.isFinite(typeScaleRatio) ? typeScaleRatio : 1.2,
    arbitraryTolerance,
    strictness,
    include: includeForScanChoice(scanPaths, customGlobs),
  };
}
