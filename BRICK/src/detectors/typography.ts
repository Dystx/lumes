import { FunctionDeclaration, ArrowFunction, FunctionExpression } from "ts-morph";
import type { DesignTokens, Issue } from "../types.js";
import {
  getElementInfo,
  getJsxElements,
  JsxElementInfo,
  parseCssValue,
  parseFontSize,
  parseTextColor,
  toPx,
} from "./helpers.js";
import { contrastRatio, contrastSlop } from "../math/contrast.js";
import { headingHierarchySlop, typographyScaleSlop } from "../math/typography.js";

type ComponentNode = FunctionDeclaration | ArrowFunction | FunctionExpression;

export interface TypographyOptions {
  typeScaleRatio: number;
  tokens?: DesignTokens;
  contrastMethod?: "wcag2" | "wcag3" | "apca";
  contrastTarget?: number;
}

const DEFAULT_HEADING_SIZES: Record<string, number> = {
  h1: 32,
  h2: 24,
  h3: 19,
  h4: 16,
  h5: 13,
  h6: 11,
};

export function detectTypographySlop(
  node: ComponentNode,
  options: TypographyOptions
): Issue[] {
  const issues: Issue[] = [];
  const target = options.contrastTarget ?? 4.5;
  const fontSizes: number[] = [];
  const headings: { level: number; fontSize: number }[] = [];

  for (const el of getJsxElements(node)) {
    const info = getElementInfo(el);
    const line = info.node.getStartLineNumber();
    const column = info.node.getStartLinePos();

    let elementFontSize: number | undefined;

    for (const c of info.classes) {
      const size = parseFontSize(c);
      if (size !== undefined) {
        fontSizes.push(size);
        elementFontSize = size;
      }
    }

    const inlineFontSize = info.styles.fontSize;
    if (inlineFontSize) {
      const parsed = parseCssValue(inlineFontSize);
      if (parsed) {
        const px = toPx(parsed.value, parsed.unit);
        fontSizes.push(px);
        elementFontSize = px;
      }
    }

    const headingMatch = /^h([1-6])$/.exec(info.tagName);
    if (headingMatch) {
      const level = parseInt(headingMatch[1], 10);
      const fontSize = elementFontSize ?? DEFAULT_HEADING_SIZES[info.tagName] ?? 16;
      headings.push({ level, fontSize });
    }

    const textColor = extractTextColor(info);
    if (textColor) {
      const bgColor = info.styles.backgroundColor ?? "#ffffff";
      const ratio = contrastRatio(textColor, bgColor);
      const slop = contrastSlop(ratio, target);
      if (slop > 0) {
        issues.push({
          ruleId: "low-contrast-text",
          category: "typography",
          severity: slop >= 0.75 ? "high" : slop >= 0.4 ? "medium" : "low",
          message: `Low contrast text color (ratio ${ratio.toFixed(2)})`,
          line,
          column,
          advice: `Ensure text meets the ${target} contrast target.`,
        });
      }
    }

    checkTypographyTokens(info, line, column, issues, options.tokens);
  }

  if (fontSizes.length >= 2) {
    const scaleSlop = typographyScaleSlop(fontSizes, options.typeScaleRatio);
    if (scaleSlop > 0) {
      issues.push({
        ruleId: "off-scale-font-size",
        category: "typography",
        severity: scaleSlop >= 0.75 ? "high" : scaleSlop >= 0.4 ? "medium" : "low",
        message: `Font sizes deviate from the ${options.typeScaleRatio} modular scale`,
        line: node.getStartLineNumber(),
        column: node.getStartLinePos(),
        advice: "Use type-scale tokens to keep sizes in a rhythmic ratio.",
      });
    }
  }

  if (headings.length >= 2) {
    const hierarchySlop = headingHierarchySlop(headings);
    if (hierarchySlop > 0) {
      issues.push({
        ruleId: "inverted-heading-hierarchy",
        category: "typography",
        severity: hierarchySlop >= 0.75 ? "high" : "medium",
        message: "Heading visual sizes do not follow semantic order",
        line: node.getStartLineNumber(),
        column: node.getStartLinePos(),
        advice: "Make higher-level headings visually larger than lower-level ones.",
      });
    }

    const levels = headings.map((h) => h.level);
    for (let i = 1; i < levels.length; i++) {
      if (levels[i] - levels[i - 1] > 1) {
        issues.push({
          ruleId: "skipped-heading-level",
          category: "typography",
          severity: "medium",
          message: `Skipped heading level from h${levels[i - 1]} to h${levels[i]}`,
          line: node.getStartLineNumber(),
          column: node.getStartLinePos(),
          advice: "Use consecutive heading levels for a proper document outline.",
        });
        break;
      }
    }
  }

  return issues;
}

function extractTextColor(info: JsxElementInfo): string | undefined {
  for (const c of info.classes) {
    const color = parseTextColor(c);
    if (color) return color;
  }
  return info.styles.color;
}

function checkTypographyTokens(
  info: JsxElementInfo,
  line: number,
  column: number,
  issues: Issue[],
  tokens?: DesignTokens
): void {
  const lineHeights = tokens?.lineHeights ?? [];
  const letterSpacings = tokens?.letterSpacing ?? [];
  const fontWeights = tokens?.fontWeights ?? [];
  const fontFamilies = tokens?.fontFamilies ?? [];

  for (const c of info.classes) {
    const leadingMatch = /^leading-\[(.+)\]$/.exec(c);
    if (leadingMatch) {
      const value = parseTokenNumber(leadingMatch[1]);
      if (value !== undefined && !lineHeights.includes(value)) {
        issues.push({
          ruleId: "hardcoded-line-height",
          category: "typography",
          severity: "low",
          message: `Hardcoded line height: ${c}`,
          line,
          column,
          advice: "Use a line-height token from the design system.",
        });
      }
    }

    const trackingMatch = /^tracking-\[(.+)\]$/.exec(c);
    if (trackingMatch) {
      const value = parseTokenNumber(trackingMatch[1]);
      if (value !== undefined && !letterSpacings.includes(value)) {
        issues.push({
          ruleId: "hardcoded-letter-spacing",
          category: "typography",
          severity: "low",
          message: `Hardcoded letter spacing: ${c}`,
          line,
          column,
          advice: "Use a letter-spacing token from the design system.",
        });
      }
    }

    const fontMatch = /^font-\[(.+)\]$/.exec(c);
    if (fontMatch) {
      const inner = fontMatch[1];
      const numeric = parseTokenNumber(inner);
      if (numeric !== undefined) {
        if (!fontWeights.includes(numeric)) {
          issues.push({
            ruleId: "hardcoded-font-weight",
            category: "typography",
            severity: "low",
            message: `Hardcoded font weight: ${c}`,
            line,
            column,
            advice: "Use a font-weight token from the design system.",
          });
        }
      } else {
        const family = parseFontFamily(inner);
        if (family && !fontFamilies.includes(family)) {
          issues.push({
            ruleId: "custom-font-family",
            category: "typography",
            severity: "low",
            message: `Custom font family: ${c}`,
            line,
            column,
            advice: "Use a font-family token from the design system.",
          });
        }
      }
    }
  }

  const lineHeightStyle = info.styles.lineHeight;
  if (lineHeightStyle) {
    const value = parseTokenNumber(lineHeightStyle);
    if (value !== undefined && !lineHeights.includes(value)) {
      issues.push({
        ruleId: "hardcoded-line-height",
        category: "typography",
        severity: "low",
        message: `Hardcoded line-height style: ${lineHeightStyle}`,
        line,
        column,
        advice: "Use a line-height token from the design system.",
      });
    }
  }

  const letterSpacingStyle = info.styles.letterSpacing;
  if (letterSpacingStyle) {
    const value = parseTokenNumber(letterSpacingStyle);
    if (value !== undefined && !letterSpacings.includes(value)) {
      issues.push({
        ruleId: "hardcoded-letter-spacing",
        category: "typography",
        severity: "low",
        message: `Hardcoded letter-spacing style: ${letterSpacingStyle}`,
        line,
        column,
        advice: "Use a letter-spacing token from the design system.",
      });
    }
  }

  const fontWeightStyle = info.styles.fontWeight;
  if (fontWeightStyle) {
    const value = parseTokenNumber(fontWeightStyle);
    if (value !== undefined && !fontWeights.includes(value)) {
      issues.push({
        ruleId: "hardcoded-font-weight",
        category: "typography",
        severity: "low",
        message: `Hardcoded font-weight style: ${fontWeightStyle}`,
        line,
        column,
        advice: "Use a font-weight token from the design system.",
      });
    }
  }

  const fontFamilyStyle = info.styles.fontFamily;
  if (fontFamilyStyle) {
    const family = parseFontFamily(fontFamilyStyle);
    if (family && !fontFamilies.includes(family)) {
      issues.push({
        ruleId: "custom-font-family",
        category: "typography",
        severity: "low",
        message: `Custom font-family style: ${fontFamilyStyle}`,
        line,
        column,
        advice: "Use a font-family token from the design system.",
      });
    }
  }
}

function parseTokenNumber(input: string): number | undefined {
  const parsed = parseCssValue(input.trim());
  if (parsed) return parsed.value;
  const bare = parseFloat(input.trim());
  return Number.isFinite(bare) ? bare : undefined;
}

function parseFontFamily(input: string): string | undefined {
  const s = input
    .replace(/font-family:/i, "")
    .replace(/^["']|["']$/g, "")
    .trim();
  const first = s.split(",")[0]?.trim();
  return first || undefined;
}
