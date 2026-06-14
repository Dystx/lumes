import { FunctionDeclaration, ArrowFunction, FunctionExpression } from "ts-morph";
import type { Issue, DesignTokens } from "../types.js";
import { getElementInfo, getJsxElements, parseCssValue, parseSpacingValue, toPx } from "./helpers.js";
import { spacingEntropySlop, spacingGridSlop } from "../math/spacing.js";
import { isCommonSpacing } from "../corpus/inference.js";
import type { ComponentNodeOrPlaceholder } from "../extractor/component.js";
import { isPlaceholder, extractClassNamesFromText } from "../extractor/component.js";

type ComponentNode = FunctionDeclaration | ArrowFunction | FunctionExpression;

export interface SpacingOptions {
  baseSpacing: number;
  entropyThreshold?: number;
  tokens?: DesignTokens;
  classNames?: string[];
  fileText?: string;
}

const SPACING_STYLE_PROPS = new Set([
  "margin",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "padding",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "gap",
  "width",
  "height",
]);

export function detectSpacingSlop(
  node: ComponentNodeOrPlaceholder,
  options: SpacingOptions
): Issue[] {
  if (isPlaceholder(node) || options.classNames !== undefined) {
    const classes = options.classNames ?? extractClassNamesFromText(node.getText());
    return detectSpacingSlopFromClasses(classes, options, node);
  }

  return detectSpacingSlopFromNode(node as ComponentNode, options);
}

function detectSpacingSlopFromClasses(
  classes: string[],
  options: SpacingOptions,
  node: ComponentNodeOrPlaceholder
): Issue[] {
  const issues: Issue[] = [];
  const base = options.baseSpacing;
  const entropyThreshold = options.entropyThreshold ?? 0.7;
  const spacingValues: number[] = [];
  const line = node.getStartLineNumber();
  const column = node.getStartLinePos();

  for (const utility of classes) {
    if (isNegativeMarginUtility(utility)) {
      issues.push({
        ruleId: "negative-margin",
        category: "spacing",
        severity: "medium",
        message: `Negative margin utility: ${utility}`,
        line,
        column,
        advice: "Avoid pulling elements out of layout with negative margins.",
      });
    }

    const value = parseSpacingValue(utility, options.tokens);
    if (value === undefined) continue;
    spacingValues.push(value);
    const slop = spacingGridSlop(value, base);
    if (slop > 0) {
      const common = isCommonSpacing(Math.abs(value));
      issues.push({
        ruleId: "off-grid-spacing",
        category: "spacing",
        severity: common ? "low" : slop >= 0.75 ? "high" : "medium",
        message: `${utility} breaks the ${base}px spacing grid`,
        line,
        column,
        advice: "Use a spacing token that aligns to the base grid.",
      });
    }
  }

  const entropy = spacingEntropySlop(spacingValues);
  if (entropy > entropyThreshold && spacingValues.length > 0) {
    issues.push({
      ruleId: "spacing-entropy",
      category: "spacing",
      severity: "low",
      message: `High spacing entropy (${(entropy * 100).toFixed(0)}% unique values)`,
      line,
      column,
      advice: "Reduce the number of unique spacing values to reinforce rhythm.",
    });
  }

  return issues;
}

function detectSpacingSlopFromNode(
  node: ComponentNode,
  options: SpacingOptions
): Issue[] {
  const issues: Issue[] = [];
  const base = options.baseSpacing;
  const entropyThreshold = options.entropyThreshold ?? 0.7;
  const spacingValues: number[] = [];

  for (const el of getJsxElements(node)) {
    const info = getElementInfo(el);
    const line = info.node.getStartLineNumber();
    const column = info.node.getStartLinePos();

    for (const utility of info.classes) {
      if (isNegativeMarginUtility(utility)) {
        issues.push({
          ruleId: "negative-margin",
          category: "spacing",
          severity: "medium",
          message: `Negative margin utility: ${utility}`,
          line,
          column,
          advice: "Avoid pulling elements out of layout with negative margins.",
        });
      }

      const value = parseSpacingValue(utility, options.tokens);
      if (value === undefined) continue;
      spacingValues.push(value);
      const slop = spacingGridSlop(value, base);
      if (slop > 0) {
        const common = isCommonSpacing(Math.abs(value));
        issues.push({
          ruleId: "off-grid-spacing",
          category: "spacing",
          severity: common ? "low" : slop >= 0.75 ? "high" : "medium",
          message: `${utility} breaks the ${base}px spacing grid`,
          line,
          column,
          advice: "Use a spacing token that aligns to the base grid.",
        });
      }
    }

    for (const [prop, raw] of Object.entries(info.styles)) {
      if (!SPACING_STYLE_PROPS.has(prop)) continue;
      const parsed = parseCssValue(raw);
      if (!parsed) continue;
      const px = toPx(parsed.value, parsed.unit);
      spacingValues.push(px);
      const slop = spacingGridSlop(px, base);
      if (slop > 0) {
        const common = isCommonSpacing(Math.abs(px));
        issues.push({
          ruleId: "off-grid-spacing",
          category: "spacing",
          severity: common ? "low" : slop >= 0.75 ? "high" : "medium",
          message: `Inline ${prop}: ${raw} breaks the ${base}px spacing grid`,
          line,
          column,
          advice: "Use a spacing token that aligns to the base grid.",
        });
      }
    }
  }

  const entropy = spacingEntropySlop(spacingValues);
  if (entropy > entropyThreshold && spacingValues.length > 0) {
    issues.push({
      ruleId: "spacing-entropy",
      category: "spacing",
      severity: "low",
      message: `High spacing entropy (${(entropy * 100).toFixed(0)}% unique values)`,
      line: node.getStartLineNumber(),
      column: node.getStartLinePos(),
      advice: "Reduce the number of unique spacing values to reinforce rhythm.",
    });
  }

  return issues;
}

function isNegativeMarginUtility(utility: string): boolean {
  return /^-m[trblxy]?-\[.+]$/.test(utility);
}
