import {
  FunctionDeclaration,
  ArrowFunction,
  FunctionExpression,
  SyntaxKind,
} from "ts-morph";
import type { Issue } from "../types.js";
import {
  loadBannedDefaults,
  BannedDefaultsRule,
} from "../ai-smells/patterns.js";
import { getElementInfo, getJsxElements, JsxElementInfo } from "./helpers.js";
import type { ComponentNodeOrPlaceholder } from "../extractor/component.js";
import { isPlaceholder, extractClassNamesFromText } from "../extractor/component.js";

type ComponentNode = FunctionDeclaration | ArrowFunction | FunctionExpression;
type JsxNode = import("ts-morph").JsxElement | import("ts-morph").JsxSelfClosingElement;

export interface AiSmellOptions {
  disabledRules: string[];
  bannedDefaults: boolean;
  classNames?: string[];
  fileText?: string;
}

const bannedDefaults = loadBannedDefaults();

export function detectAiSmells(
  node: ComponentNodeOrPlaceholder,
  options: AiSmellOptions
): Issue[] {
  if (options.bannedDefaults === false) return [];

  if (isPlaceholder(node) || options.classNames !== undefined) {
    const classes = options.classNames ?? extractClassNamesFromText(node.getText());
    return detectAiSmellsFromClasses(classes, options, node);
  }

  return detectAiSmellsFromNode(node as ComponentNode, options);
}

function detectAiSmellsFromClasses(
  classes: string[],
  options: AiSmellOptions,
  node: ComponentNodeOrPlaceholder
): Issue[] {
  const issues: Issue[] = [];
  const disabled = new Set(options.disabledRules);
  const line = node.getStartLineNumber();
  const column = node.getStartLinePos();

  for (const rule of bannedDefaults.rules) {
    if (disabled.has(rule.id)) continue;

    if (rule.patterns.pageStructure) {
      // Page-structure rules require element hierarchy; skip for raw class lists.
      continue;
    }

    const matched = matchRule(classes, {}, rule);
    if (matched) {
      issues.push({
        ruleId: rule.id,
        category: rule.category,
        severity: rule.severity,
        message: rule.message,
        line,
        column,
        advice: adviceForRule(rule.id),
      });
      break;
    }
  }

  return issues;
}

function detectAiSmellsFromNode(
  node: ComponentNode,
  options: AiSmellOptions
): Issue[] {
  const issues: Issue[] = [];
  const disabled = new Set(options.disabledRules);

  const elementInfos = getJsxElements(node).map((el) => getElementInfo(el));

  for (const rule of bannedDefaults.rules) {
    if (disabled.has(rule.id)) continue;

    if (rule.patterns.pageStructure) {
      if (hasSaaSTemplateStructure(elementInfos)) {
        issues.push({
          ruleId: rule.id,
          category: rule.category,
          severity: rule.severity,
          message: rule.message,
          line: node.getStartLineNumber(),
          column: node.getStartLinePos(),
          advice: adviceForRule(rule.id),
        });
      }
      continue;
    }

    for (const info of elementInfos) {
      const matched = matchRule(info.classes, info.styles, rule);
      if (matched) {
        issues.push({
          ruleId: rule.id,
          category: rule.category,
          severity: rule.severity,
          message: rule.message,
          line: info.node.getStartLineNumber(),
          column: info.node.getStartLinePos(),
          advice: adviceForRule(rule.id),
        });
        break;
      }
    }
  }

  return issues;
}

function matchRule(
  classes: string[],
  styles: Record<string, string>,
  rule: BannedDefaultsRule
): boolean {
  const patterns = rule.patterns;

  if (patterns.classNames) {
    for (const cls of classes) {
      if (patterns.classNames.some((p) => utilityMatches(cls, p))) {
        return true;
      }
    }
  }

  if (patterns.fontFamily) {
    const fontFamilyStyle = styles.fontFamily ?? styles.font;
    if (fontFamilyStyle) {
      const normalized = fontFamilyStyle.replace(/^["']|["']$/g, "");
      if (patterns.fontFamily.some((f) => normalized.includes(f))) {
        return true;
      }
    }
    for (const cls of classes) {
      const m = /^font-\[(.+)]$/.exec(cls);
      if (m) {
        const value = m[1].replace(/^["']|["']$/g, "");
        if (patterns.fontFamily.some((f) => value.includes(f))) {
          return true;
        }
      }
    }
  }

  return false;
}

function getDescendantJsxElements(
  node: JsxNode
): (import("ts-morph").JsxElement | import("ts-morph").JsxSelfClosingElement)[] {
  return [
    ...node.getDescendantsOfKind(SyntaxKind.JsxElement),
    ...node.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
  ];
}

function hasCenteredHero(elements: JsxElementInfo[]): boolean {
  return elements.some((info) => {
    if (info.tagName !== "div" && info.tagName !== "section") return false;
    const cls = info.classes.join(" ");
    const hasCenter = cls.includes("text-center");
    const hasAutoMargin = cls.includes("mx-auto");
    const hasMaxWidth = /\bmax-w-/.test(cls);
    const hasVerticalPadding = /\bpy-\d+\b/.test(cls) || /\bpy-\[/.test(cls);
    if (!(hasCenter && hasAutoMargin && (hasMaxWidth || hasVerticalPadding))) {
      return false;
    }
    return getDescendantJsxElements(info.node).some((child) => {
      const tagName =
        child.getKind() === SyntaxKind.JsxElement
          ? child.asKind(SyntaxKind.JsxElement)?.getOpeningElement().getTagNameNode().getText()
          : child.asKind(SyntaxKind.JsxSelfClosingElement)?.getTagNameNode().getText();
      return tagName === "h1" || tagName === "h2";
    });
  });
}

function hasThreeColumnFeatureGrid(elements: JsxElementInfo[]): boolean {
  return elements.some((info) => {
    if (info.tagName !== "div" && info.tagName !== "section") return false;
    const cls = info.classes.join(" ");
    const isGrid = /\bgrid\b/.test(cls);
    const hasThreeCols =
      /\bgrid-cols-3\b/.test(cls) ||
      /\bmd:grid-cols-3\b/.test(cls) ||
      /\blg:grid-cols-3\b/.test(cls) ||
      /\bxl:grid-cols-3\b/.test(cls);
    if (!isGrid || !hasThreeCols) return false;
    // A feature grid usually maps an array of cards.
    return info.node
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .some((call) => call.getExpression().getText().endsWith(".map"));
  });
}

function hasSaaSTemplateStructure(elements: JsxElementInfo[]): boolean {
  return hasCenteredHero(elements) && hasThreeColumnFeatureGrid(elements);
}

const REGEX_TOKENS = /[\\.+*?^$|()[\]]/;

function utilityMatches(utility: string, pattern: string): boolean {
  if (REGEX_TOKENS.test(pattern)) {
    try {
      return new RegExp(pattern).test(utility);
    } catch {
      return false;
    }
  }
  if (pattern.endsWith("-")) {
    return utility.startsWith(pattern);
  }
  return utility === pattern;
}

function adviceForRule(ruleId: string): string {
  switch (ruleId) {
    case "no-glassmorphism":
      return "Use opaque surfaces or intentional design tokens for translucency.";
    case "no-gradient-hero":
      return "Rely on typography, spacing, or imagery instead of default gradients.";
    case "max-radius":
      return "Use a radius token appropriate to the component size.";
    case "no-generic-font-stack":
      return "Choose a font stack that matches the brand and load it explicitly.";
    case "no-saas-template-structure":
      return "Break the template into distinctive sections with real content.";
    default:
      return "Review the pattern and replace with a design-system alternative.";
  }
}
