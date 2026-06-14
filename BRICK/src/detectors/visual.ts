import {
  FunctionDeclaration,
  ArrowFunction,
  FunctionExpression,
  SyntaxKind,
  SourceFile,
} from "ts-morph";
import type { Issue, Severity, DesignTokens } from "../types.js";

import {
  colorAlpha,
  getElementInfo,
  getJsxElements,
  isArbitraryColorValue,
  JsxElementInfo,
  parseBackgroundColor,
  parseCssValue,
  parseTextColor,
  toPx,
} from "./helpers.js";
import { contrastRatio, contrastSlop } from "../math/contrast.js";
import {
  isCommonColor,
  isCommonFontSize,
  isCommonSpacing,
} from "../corpus/inference.js";
import type { ComponentNodeOrPlaceholder } from "../extractor/component.js";
import { isPlaceholder, extractClassNamesFromText } from "../extractor/component.js";

type ComponentNode = FunctionDeclaration | ArrowFunction | FunctionExpression;

export interface VisualOptions {
  baseSpacing: number;
  arbitraryTolerance: "strict" | "balanced" | "permissive";
  contrastMethod?: "wcag2" | "wcag3" | "apca";
  contrastTarget?: number;
  radiusThreshold?: number;
  stylePropThreshold?: number;
  tokens?: DesignTokens;
  classNames?: string[];
  fileText?: string;
}

export function detectVisualSlop(
  node: ComponentNodeOrPlaceholder,
  options: VisualOptions
): Issue[] {
  if (isPlaceholder(node) || options.classNames !== undefined) {
    const classes = options.classNames ?? extractClassNamesFromText(node.getText());
    return detectVisualSlopFromClasses(classes, options, node);
  }

  return detectVisualSlopFromNode(node as ComponentNode, options);
}

function detectVisualSlopFromClasses(
  classes: string[],
  options: VisualOptions,
  node: ComponentNodeOrPlaceholder
): Issue[] {
  const issues: Issue[] = [];
  const target = options.contrastTarget ?? 4.5;
  const radiusThreshold = options.radiusThreshold ?? 24;
  const tokens: DesignTokens = options.tokens ?? {
    spacing: [],
    radii: [],
    fontSizes: [],
    colors: [],
    zIndex: [],
    shadows: [],
    lineHeights: [],
    letterSpacing: [],
    fontWeights: [],
    fontFamilies: [],
  };
  let absoluteCount = 0;

  const line = node.getStartLineNumber();
  const column = node.getStartLinePos();

  const arbitraryColors = classes.filter((c) => {
    const m = /^(bg|text|border|fill|stroke)-\[(.+)\]$/.exec(c);
    return m ? isArbitraryColorValue(m[2]) && !isOklchOrLch(m[2]) : false;
  });

  if (arbitraryColors.length > 0) {
    const common = arbitraryColors.some((c) => {
      const m = /\[(.+)\]$/.exec(c);
      return m ? isCommonColor(m[1]) : false;
    });
    issues.push({
      ruleId: "arbitrary-color",
      category: "visual",
      severity: common ? "low" : severityForTolerance(options.arbitraryTolerance),
      message: `${arbitraryColors.length} arbitrary color value(s) detected (${arbitraryColors.join(", ")})`,
      line,
      column,
      advice: "Use semantic color tokens instead of hardcoded colors.",
    });
  }

  const arbitraryUtilities = classes.filter((c) => {
    const m = /^([a-z-]+)-\[(.+)\]$/.exec(c);
    if (!m) return false;
    return !isArbitraryColorValue(m[2]);
  });

  if (arbitraryUtilities.length > 0) {
    const common = arbitraryUtilities.some(isCommonArbitraryValue);
    issues.push({
      ruleId: "arbitrary-tailwind-value",
      category: "visual",
      severity: common ? "low" : "high",
      message: `${arbitraryUtilities.length} arbitrary Tailwind utility value(s) detected (${arbitraryUtilities.join(", ")})`,
      line,
      column,
      advice: "Use design-system tokens instead of arbitrary bracket values.",
    });
  }

  const hardcodedColors = classes.filter((c) => isHardcodedTailwindColor(c, tokens));
  if (hardcodedColors.length > 0) {
    issues.push({
      ruleId: "hardcoded-tailwind-color",
      category: "visual",
      severity: "low",
      message: `${hardcodedColors.length} hardcoded Tailwind color(s) detected (${hardcodedColors.join(", ")})`,
      line,
      column,
      advice: "Use a project color token instead of a default Tailwind palette color.",
    });
  }

  const oklchColors = classes.filter((c) => isNonTokenOklchColor(c, tokens));
  if (oklchColors.length > 0) {
    issues.push({
      ruleId: "non-token-oklch-color",
      category: "visual",
      severity: "low",
      message: `${oklchColors.length} non-token OKLCH/LCH color(s) detected (${oklchColors.join(", ")})`,
      line,
      column,
      advice: "Map OKLCH/LCH values to semantic color tokens.",
    });
  }

  if (classes.includes("absolute") || classes.includes("fixed")) {
    absoluteCount++;
  }

  const hasBackdropBlur = classes.some((c) => c.startsWith("backdrop-blur"));
  const hasTranslucentBg = classes.some((c) => {
    const color = parseBackgroundColor(c);
    return color ? colorAlpha(color) < 1 : false;
  });
  if (hasBackdropBlur && hasTranslucentBg) {
    issues.push({
      ruleId: "glassmorphism",
      category: "visual",
      severity: "medium",
      message: "Glassmorphism (backdrop-blur + translucent background) detected",
      line,
      column,
      advice: "Ensure glassmorphism is intentional and accessible.",
    });
  }

  for (const c of classes) {
    const radiusMatch = /^rounded-\[(.+)\]$/.exec(c);
    if (radiusMatch) {
      const parsed = parseCssValue(radiusMatch[1]);
      const px = parsed ? toPx(parsed.value, parsed.unit) : undefined;
      if (px !== undefined && px > radiusThreshold) {
        issues.push({
          ruleId: "excessive-radius",
          category: "visual",
          severity: "low",
          message: `Excessive border radius: ${c}`,
          line,
          column,
          advice: "Use a radius token that matches the design system.",
        });
      }
    }
    if (c === "rounded-full") {
      issues.push({
        ruleId: "excessive-radius",
        category: "visual",
        severity: "low",
        message: "Pill-shaped or fully rounded radius used",
        line,
        column,
        advice: "Use a radius token unless the element is meant to be fully rounded.",
      });
    }

    const zMatch = /^z-\[(.+)]$/.exec(c);
    if (zMatch) {
      const parsed = parseCssValue(zMatch[1]);
      const value = parsed?.value ?? parseFloat(zMatch[1]);
      if (Number.isFinite(value) && isMagicZIndex(value)) {
        issues.push({
          ruleId: "magic-z-index",
          category: "visual",
          severity: "medium",
          message: `Arbitrary z-index value: ${c}`,
          line,
          column,
          advice: "Use a design-token z-index scale instead of magic numbers.",
        });
      }
    }
  }

  const textColor = extractTextColorFromClasses(classes);
  const bgColorValue = extractBackgroundColorFromClasses(classes);
  if (textColor && bgColorValue) {
    const ratio = contrastRatio(textColor, bgColorValue);
    const slop = contrastSlop(ratio, target);
    if (slop > 0) {
      issues.push({
        ruleId: "low-contrast",
        category: "visual",
        severity: contrastSeverity(slop),
        message: `Low contrast text/background pair (ratio ${ratio.toFixed(2)})`,
        line,
        column,
        advice: `Target contrast ratio is ${target}. Use higher-contrast color tokens.`,
      });
    }
  }

  if (absoluteCount > 2) {
    issues.push({
      ruleId: "excessive-absolute-positioning",
      category: "visual",
      severity: "low",
      message: `${absoluteCount} absolute/fixed positioned elements without a clear layout parent`,
      line,
      column,
      advice: "Prefer layout primitives (flex/grid) over many absolutely positioned children.",
    });
  }

  return issues;
}

function detectVisualSlopFromNode(
  node: ComponentNode,
  options: VisualOptions
): Issue[] {
  const issues: Issue[] = [];
  const target = options.contrastTarget ?? 4.5;
  const radiusThreshold = options.radiusThreshold ?? 24;
  const stylePropThreshold = options.stylePropThreshold ?? 3;
  const tokens: DesignTokens = options.tokens ?? {
    spacing: [],
    radii: [],
    fontSizes: [],
    colors: [],
    zIndex: [],
    shadows: [],
    lineHeights: [],
    letterSpacing: [],
    fontWeights: [],
    fontFamilies: [],
  };
  let stylePropCount = 0;
  let absoluteCount = 0;

  const elements = getJsxElements(node).map((el) => getElementInfo(el));

  for (const info of elements) {
    const line = info.node.getStartLineNumber();
    const column = info.node.getStartLinePos();

    const arbitraryColors = info.classes.filter((c) => {
      const m = /^(bg|text|border|fill|stroke)-\[(.+)\]$/.exec(c);
      return m ? isArbitraryColorValue(m[2]) && !isOklchOrLch(m[2]) : false;
    });

    if (arbitraryColors.length > 0) {
      const common = arbitraryColors.some((c) => {
        const m = /\[(.+)\]$/.exec(c);
        return m ? isCommonColor(m[1]) : false;
      });
      issues.push({
        ruleId: "arbitrary-color",
        category: "visual",
        severity: common ? "low" : severityForTolerance(options.arbitraryTolerance),
        message: `${arbitraryColors.length} arbitrary color value(s) detected (${arbitraryColors.join(", ")})`,
        line,
        column,
        advice: "Use semantic color tokens instead of hardcoded colors.",
      });
    }

    const arbitraryUtilities = info.classes.filter((c) => {
      const m = /^([a-z-]+)-\[(.+)\]$/.exec(c);
      if (!m) return false;
      return !isArbitraryColorValue(m[2]);
    });

    if (arbitraryUtilities.length > 0) {
      const common = arbitraryUtilities.some(isCommonArbitraryValue);
      issues.push({
        ruleId: "arbitrary-tailwind-value",
        category: "visual",
        severity: common ? "low" : "high",
        message: `${arbitraryUtilities.length} arbitrary Tailwind utility value(s) detected (${arbitraryUtilities.join(", ")})`,
        line,
        column,
        advice: "Use design-system tokens instead of arbitrary bracket values.",
      });
    }

    const hardcodedColors = info.classes.filter((c) =>
      isHardcodedTailwindColor(c, tokens)
    );
    if (hardcodedColors.length > 0) {
      issues.push({
        ruleId: "hardcoded-tailwind-color",
        category: "visual",
        severity: "low",
        message: `${hardcodedColors.length} hardcoded Tailwind color(s) detected (${hardcodedColors.join(", ")})`,
        line,
        column,
        advice: "Use a project color token instead of a default Tailwind palette color.",
      });
    }

    const oklchColors = info.classes.filter((c) =>
      isNonTokenOklchColor(c, tokens)
    );
    if (oklchColors.length > 0) {
      issues.push({
        ruleId: "non-token-oklch-color",
        category: "visual",
        severity: "low",
        message: `${oklchColors.length} non-token OKLCH/LCH color(s) detected (${oklchColors.join(", ")})`,
        line,
        column,
        advice: "Map OKLCH/LCH values to semantic color tokens.",
      });
    }

    if (info.classes.includes("absolute") || info.classes.includes("fixed")) {
      absoluteCount++;
    }

    const hasBackdropBlur = info.classes.some((c) => c.startsWith("backdrop-blur"));
    const backdropStyle = info.styles.backdropFilter ?? info.styles.WebkitBackdropFilter;
    const hasBackdropStyle = typeof backdropStyle === "string" && /blur/i.test(backdropStyle);

    const bgColorUtility = info.classes.find((c) => c.startsWith("bg-"));
    const bgStyleValue = info.styles.backgroundColor;
    const isTranslucent =
      (bgColorUtility && colorAlpha(parseBackgroundColor(bgColorUtility) ?? bgColorUtility) < 1) ||
      (bgStyleValue && colorAlpha(bgStyleValue) < 1);

    if ((hasBackdropBlur || hasBackdropStyle) && isTranslucent) {
      issues.push({
        ruleId: "glassmorphism",
        category: "visual",
        severity: "medium",
        message: "Glassmorphism (backdrop-blur + translucent background) detected",
        line,
        column,
        advice: "Ensure glassmorphism is intentional and accessible.",
      });
    }

    for (const c of info.classes) {
      const radiusMatch = /^rounded-\[(.+)\]$/.exec(c);
      if (radiusMatch) {
        const parsed = parseCssValue(radiusMatch[1]);
        const px = parsed ? toPx(parsed.value, parsed.unit) : undefined;
        if (px !== undefined && px > radiusThreshold) {
          issues.push({
            ruleId: "excessive-radius",
            category: "visual",
            severity: "low",
            message: `Excessive border radius: ${c}`,
            line,
            column,
            advice: "Use a radius token that matches the design system.",
          });
        }
      }
      if (c === "rounded-full") {
        issues.push({
          ruleId: "excessive-radius",
          category: "visual",
          severity: "low",
          message: "Pill-shaped or fully rounded radius used",
          line,
          column,
          advice: "Use a radius token unless the element is meant to be fully rounded.",
        });
      }
    }

    if (Object.keys(info.styles).length > 0) {
      stylePropCount++;
      issues.push({
        ruleId: "inline-style-prop",
        category: "visual",
        severity: "high",
        message: "Inline style prop detected",
        line,
        column,
        advice: "Move styles to Tailwind utilities or design tokens.",
      });
    }

    const fixedDimension = extractFixedDimension(info);
    if (fixedDimension) {
      issues.push({
        ruleId: "fixed-dimension",
        category: "visual",
        severity: "low",
        message: `Fixed dimension: ${fixedDimension}`,
        line,
        column,
        advice: "Use responsive, token-based sizing instead of fixed widths or heights.",
      });
    }

    for (const c of info.classes) {
      const zMatch = /^z-\[(.+)]$/.exec(c);
      if (zMatch) {
        const parsed = parseCssValue(zMatch[1]);
        const value = parsed?.value ?? parseFloat(zMatch[1]);
        if (Number.isFinite(value) && isMagicZIndex(value)) {
          issues.push({
            ruleId: "magic-z-index",
            category: "visual",
            severity: "medium",
            message: `Arbitrary z-index value: ${c}`,
            line,
            column,
            advice: "Use a design-token z-index scale instead of magic numbers.",
          });
        }
      }
    }

    const borderRadiusStyle = info.styles.borderRadius;
    if (borderRadiusStyle) {
      const parsed = parseCssValue(borderRadiusStyle);
      const px = parsed ? toPx(parsed.value, parsed.unit) : undefined;
      if (px !== undefined && px > radiusThreshold) {
        issues.push({
          ruleId: "excessive-radius",
          category: "visual",
          severity: "low",
          message: `Excessive inline border radius: ${borderRadiusStyle}`,
          line,
          column,
          advice: "Use a radius token that matches the design system.",
        });
      }
    }

    const textColor = extractTextColor(info);
    const bgColorValue = extractBackgroundColor(info);
    if (textColor && bgColorValue) {
      const ratio = contrastRatio(textColor, bgColorValue);
      const slop = contrastSlop(ratio, target);
      if (slop > 0) {
        issues.push({
          ruleId: "low-contrast",
          category: "visual",
          severity: contrastSeverity(slop),
          message: `Low contrast text/background pair (ratio ${ratio.toFixed(2)})`,
          line,
          column,
          advice: `Target contrast ratio is ${target}. Use higher-contrast color tokens.`,
        });
      }
    }
  }

  if (stylePropCount >= stylePropThreshold) {
    issues.push({
      ruleId: "generic-style-prop",
      category: "visual",
      severity: "medium",
      message: `${stylePropCount} inline style props detected`,
      line: node.getStartLineNumber(),
      column: node.getStartLinePos(),
      advice: "Prefer Tailwind utilities or design tokens over inline styles.",
    });
  }

  if (absoluteCount > 2) {
    issues.push({
      ruleId: "excessive-absolute-positioning",
      category: "visual",
      severity: "low",
      message: `${absoluteCount} absolute/fixed positioned elements without a clear layout parent`,
      line: node.getStartLineNumber(),
      column: node.getStartLinePos(),
      advice: "Prefer layout primitives (flex/grid) over many absolutely positioned children.",
    });
  }

  if (hasMixedStylingSystem(node, elements)) {
    issues.push({
      ruleId: "mixed-styling-system",
      category: "visual",
      severity: "medium",
      message: "Mixed styling systems detected (Tailwind + CSS Modules / styled-components / Emotion)",
      line: node.getStartLineNumber(),
      column: node.getStartLinePos(),
      advice: "Consolidate on a single styling system per component.",
    });
  }

  return issues;
}

function isMagicZIndex(value: number): boolean {
  if (value >= 10000) return true;
  const str = String(Math.abs(Math.round(value)));
  return /^(9{3,}|0{3,})$/.test(str);
}

function severityForTolerance(tolerance: VisualOptions["arbitraryTolerance"]): Severity {
  if (tolerance === "strict") return "critical";
  if (tolerance === "permissive") return "medium";
  return "high";
}

function contrastSeverity(slop: number): Severity {
  if (slop >= 0.75) return "high";
  if (slop >= 0.4) return "medium";
  return "low";
}

function extractTextColor(info: JsxElementInfo): string | undefined {
  for (const c of info.classes) {
    const color = parseTextColor(c);
    if (color) return color;
  }
  return info.styles.color;
}

function extractTextColorFromClasses(classes: string[]): string | undefined {
  for (const c of classes) {
    const color = parseTextColor(c);
    if (color) return color;
  }
  return undefined;
}

function extractBackgroundColor(info: JsxElementInfo): string | undefined {
  for (const c of info.classes) {
    const color = parseBackgroundColor(c);
    if (color) return color;
  }
  return info.styles.backgroundColor;
}

function extractBackgroundColorFromClasses(classes: string[]): string | undefined {
  for (const c of classes) {
    const color = parseBackgroundColor(c);
    if (color) return color;
  }
  return undefined;
}

function isOklchOrLch(value: string): boolean {
  return /^(oklch|lch)\s*\(/i.test(value.trim());
}

function isHardcodedTailwindColor(utility: string, tokens: DesignTokens): boolean {
  const m = /^(bg|text|border|fill|stroke)-(.+)$/.exec(utility);
  if (!m) return false;
  const suffix = m[2];
  // Arbitrary colors are handled by other rules.
  if (suffix.startsWith("[") && suffix.endsWith("]")) return false;
  // Skip special keywords.
  const base = suffix.split("/")[0];
  if (/^(currentColor|current|transparent|inherit|none|white|black)$/.test(base)) return false;
  // Only flag named color segments like red-500 or blue-400.
  const namedMatch = /^([a-z]+)-(\d+)$/.exec(base);
  if (!namedMatch) return false;
  const colorName = namedMatch[1];
  if (tokens.colors.length === 0) return true;
  return !tokens.colors.some((c) => c.name === colorName);
}

function normalizeOklch(input: string): string {
  return input.toLowerCase().replace(/[\s_]+/g, "");
}

function isNonTokenOklchColor(utility: string, tokens: DesignTokens): boolean {
  const m = /^(bg|text|border|fill|stroke)-\[(oklch|lch)\((.+)\)\]$/.exec(utility);
  if (!m) return false;
  if (tokens.colors.length === 0) return true;
  const fn = m[2].toLowerCase();
  const value = m[3];
  const normalized = normalizeOklch(`${fn}(${value})`);
  return !tokens.colors.some(
    (c) => c.oklch && normalizeOklch(c.oklch) === normalized
  );
}

function extractFixedDimension(info: JsxElementInfo): string | undefined {
  const width = info.styles.width;
  const height = info.styles.height;
  const parts: string[] = [];
  if (width && parseCssValue(width)) parts.push(`width: ${width}`);
  if (height && parseCssValue(height)) parts.push(`height: ${height}`);
  return parts.length > 0 ? parts.join(", ") : undefined;
}

function isCommonArbitraryValue(utility: string): boolean {
  const m = /\[(\d+(?:\.\d+)?)(px|rem|em)?\]/.exec(utility);
  if (!m) return false;
  const value = parseFloat(m[1]);
  const unit = (m[2] ?? "px").toLowerCase();
  if (!Number.isFinite(value)) return false;
  const px = unit === "rem" || unit === "em" ? value * 16 : value;
  if (/^text-/.test(utility)) return isCommonFontSize(px);
  return isCommonSpacing(px);
}

// --- Mixed styling system detection ---

const CSS_MODULES_EXTENSIONS = /\.module\.(css|scss|sass|less|styl)$/i;

function getCssModulesBindings(sourceFile: SourceFile): string[] {
  const bindings: string[] = [];
  for (const imp of sourceFile.getImportDeclarations()) {
    const specifier = imp.getModuleSpecifierValue();
    if (!specifier || !CSS_MODULES_EXTENSIONS.test(specifier)) continue;
    const defaultImport = imp.getDefaultImport();
    if (defaultImport) bindings.push(defaultImport.getText());
    for (const named of imp.getNamedImports()) {
      bindings.push(named.getName());
    }
  }
  return bindings;
}

function hasCssProp(elements: JsxElementInfo[]): boolean {
  for (const info of elements) {
    for (const attr of info.attributes) {
      if (attr.getKind() !== SyntaxKind.JsxAttribute) continue;
      const jsxAttr = attr.asKind(SyntaxKind.JsxAttribute);
      if (jsxAttr && jsxAttr.getNameNode().getText() === "css") return true;
    }
  }
  return false;
}

function hasStyledComponents(node: ComponentNode): boolean {
  const sourceFile = node.getSourceFile();
  const styledExpressions: string[] = [];
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    styledExpressions.push(call.getExpression().getText());
  }
  for (const tag of sourceFile.getDescendantsOfKind(SyntaxKind.TaggedTemplateExpression)) {
    styledExpressions.push(tag.getTag().getText());
  }
  return styledExpressions.some((expr) => expr === "styled" || expr.startsWith("styled."));
}

function hasCssModulesUsage(node: ComponentNode, elements: JsxElementInfo[]): boolean {
  const sourceFile = node.getSourceFile();
  const bindings = getCssModulesBindings(sourceFile);
  if (bindings.length === 0) return false;
  for (const info of elements) {
    for (const attr of info.attributes) {
      if (attr.getKind() !== SyntaxKind.JsxAttribute) continue;
      const jsxAttr = attr.asKind(SyntaxKind.JsxAttribute);
      if (!jsxAttr || jsxAttr.getNameNode().getText() !== "className") continue;
      const init = jsxAttr.getInitializer();
      if (!init) continue;
      const text = init.getText();
      for (const binding of bindings) {
        if (text.includes(binding)) return true;
      }
    }
  }
  return false;
}

const TAILWIND_ZERO_ARG = new Set([
  "flex", "grid", "block", "inline", "contents", "hidden", "table", "table-cell", "table-row",
  "relative", "absolute", "fixed", "sticky", "static",
  "container", "sr-only", "not-sr-only",
  "visible", "invisible", "collapse",
  "overflow-auto", "overflow-hidden", "overflow-visible", "overflow-scroll", "overflow-x-auto", "overflow-x-hidden", "overflow-x-visible", "overflow-x-scroll", "overflow-y-auto", "overflow-y-hidden", "overflow-y-visible", "overflow-y-scroll",
  "truncate", "text-ellipsis", "text-clip", "break-normal", "break-words", "break-all",
  "uppercase", "lowercase", "capitalize", "normal-case",
  "underline", "overline", "line-through", "no-underline",
  "antialiased", "subpixel-antialiased",
  "flex-row", "flex-row-reverse", "flex-col", "flex-col-reverse",
  "flex-wrap", "flex-wrap-reverse", "flex-nowrap",
  "flex-1", "flex-auto", "flex-initial", "flex-none",
]);

const TAILWIND_PREFIXES = new Set([
  "bg", "text", "border", "fill", "stroke", "outline", "ring", "divide", "placeholder", "selection", "marker", "accent", "caret",
  "p", "px", "py", "pt", "pr", "pb", "pl",
  "m", "mx", "my", "mt", "mr", "mb", "ml",
  "space", "gap",
  "w", "h", "min-w", "max-w", "min-h", "max-h", "basis", "grow", "shrink", "size", "aspect", "columns",
  "justify", "items", "content", "self", "place", "order",
  "col", "row", "grid-cols", "grid-rows", "grid-flow", "auto-cols", "auto-rows",
  "rounded", "shadow", "opacity", "z",
  "top", "right", "bottom", "left", "inset",
  "translate", "rotate", "scale", "skew", "origin",
  "transition", "duration", "ease", "delay", "animate", "will-change",
  "cursor", "select", "pointer-events", "touch", "user",
  "object", "float", "clear", "box", "display",
  "indent", "align", "whitespace", "leading", "tracking", "font",
]);

function stripVariants(cls: string): string {
  return cls.split(":").pop() ?? cls;
}

function cleanClass(cls: string): string {
  return stripVariants(cls).replace(/^[^a-z0-9]+|[^a-z0-9-]+$/gi, "");
}

function looksLikeTailwindUtility(cls: string): boolean {
  if (cls.includes("[")) return true;
  const base = cleanClass(cls);
  if (TAILWIND_ZERO_ARG.has(base)) return true;
  const prefix = base.split("-")[0];
  if (!prefix) return false;
  // Two-part prefixes (min-w, max-w, grid-cols, pointer-events, etc.)
  const doublePrefix = base.split("-").slice(0, 2).join("-");
  if (TAILWIND_PREFIXES.has(doublePrefix) && base.length > doublePrefix.length) return true;
  return TAILWIND_PREFIXES.has(prefix) && base.length > prefix.length;
}

function hasTailwindClasses(elements: JsxElementInfo[]): boolean {
  return elements.some((info) => info.classes.some(looksLikeTailwindUtility));
}

function hasMixedStylingSystem(
  node: ComponentNode,
  elements: JsxElementInfo[]
): boolean {
  if (!hasTailwindClasses(elements)) return false;
  return (
    hasCssProp(elements) ||
    hasStyledComponents(node) ||
    hasCssModulesUsage(node, elements)
  );
}
