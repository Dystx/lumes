export { detectVisualSlop, type VisualOptions } from "./visual.js";
export { detectSpacingSlop, type SpacingOptions } from "./spacing.js";
export { detectTypographySlop, type TypographyOptions } from "./typography.js";
export { detectComponentSlop, type ComponentOptions } from "./components.js";
export { detectA11ySlop, type A11yOptions } from "./a11y.js";
export { detectLogicSlop, type LogicOptions } from "./logic.js";
export { detectArchitectureSlop, type ArchitectureOptions } from "./architecture.js";
export { detectAiSmells, type AiSmellOptions } from "./ai-smells.js";

import type { Issue, SlopAuditConfig, DesignTokens } from "../types.js";
import type { ComponentNodeOrPlaceholder } from "../extractor/component.js";
import { isPlaceholder, extractClassNamesFromText } from "../extractor/component.js";
import { detectVisualSlop } from "./visual.js";
import { detectSpacingSlop } from "./spacing.js";
import { detectTypographySlop } from "./typography.js";
import { detectComponentSlop } from "./components.js";
import { detectA11ySlop } from "./a11y.js";
import { detectLogicSlop } from "./logic.js";
import { detectArchitectureSlop } from "./architecture.js";
import { detectAiSmells } from "./ai-smells.js";
import { emptyTokens } from "../tokenizer/index.js";
import { classifyContext, adjustSeverity } from "../context/classifier.js";

export function runDetectors(
  node: ComponentNodeOrPlaceholder,
  config: SlopAuditConfig,
  tokens: DesignTokens = emptyTokens(),
  projectPath?: string,
  filePath?: string
): Issue[] {
  const sourcePath = filePath ?? node.getSourceFile().getFilePath();
  const classNames = isPlaceholder(node)
    ? extractClassNamesFromText(node.getText())
    : undefined;
  const fileText = isPlaceholder(node) ? node.getText() : undefined;

  let issues: Issue[];

  if (isPlaceholder(node)) {
    issues = [
      ...detectVisualSlop(node, {
        baseSpacing: config.baseSpacing,
        arbitraryTolerance: config.arbitraryTolerance,
        contrastMethod: config.rules.contrastMethod,
        contrastTarget: config.rules.contrastTarget,
        tokens,
        classNames,
        fileText,
      }),
      ...detectSpacingSlop(node, {
        baseSpacing: config.baseSpacing,
        tokens,
        classNames,
        fileText,
      }),
      ...detectArchitectureSlop(node, { projectPath, fileText }),
      ...detectAiSmells(node, {
        disabledRules: config.disabledRules ?? [],
        bannedDefaults: config.bannedDefaults,
        classNames,
        fileText,
      }),
    ];
  } else {
    issues = [
      ...detectVisualSlop(node, {
        baseSpacing: config.baseSpacing,
        arbitraryTolerance: config.arbitraryTolerance,
        contrastMethod: config.rules.contrastMethod,
        contrastTarget: config.rules.contrastTarget,
        tokens,
      }),
      ...detectSpacingSlop(node, {
        baseSpacing: config.baseSpacing,
        tokens,
      }),
      ...detectTypographySlop(node, {
        typeScaleRatio: config.typeScaleRatio ?? 1.2,
        tokens,
        contrastMethod: config.rules.contrastMethod,
        contrastTarget: config.rules.contrastTarget,
      }),
      ...detectComponentSlop(node, {
        registry: config.componentRegistry,
        maxJsxNestingDepth: config.rules.maxJsxNestingDepth,
        maxDirectChildren: config.rules.maxDirectChildren,
        maxProps: config.rules.maxProps,
        maxComponentLines: config.rules.maxComponentLines,
      }),
      ...detectA11ySlop(node),
      ...detectLogicSlop(node, {
        maxUseEffectPerComponent: config.rules.maxUseEffectPerComponent,
      }),
      ...detectArchitectureSlop(node, { projectPath }),
      ...detectAiSmells(node, {
        disabledRules: config.disabledRules ?? [],
        bannedDefaults: config.bannedDefaults,
      }),
    ];
  }

  const disabled = config.disabledRules ?? [];
  const filtered = issues.filter((issue) => !disabled.includes(issue.ruleId));

  const context = classifyContext(sourcePath, config);

  return filtered.map((issue) => ({
    ...issue,
    severity: adjustSeverity(issue, context),
  }));
}
