import {
  FunctionDeclaration,
  ArrowFunction,
  FunctionExpression,
  SyntaxKind,
  JsxElement,
  JsxSelfClosingElement,
  JsxAttribute,
  JsxAttributeLike,
  JsxExpression,
} from "ts-morph";
import type { Issue } from "../types.js";
import { getElementInfo, getJsxElements } from "./helpers.js";

type ComponentNode = FunctionDeclaration | ArrowFunction | FunctionExpression;

export interface ComponentOptions {
  registry: Record<string, string[]>;
  maxJsxNestingDepth: number;
  maxDirectChildren: number;
  maxProps: number;
  maxComponentLines: number;
}

export function detectComponentSlop(
  node: ComponentNode,
  options: ComponentOptions
): Issue[] {
  const issues: Issue[] = [];
  const elements = getJsxElements(node);

  checkFileLength(node, options.maxComponentLines, issues);

  for (const el of elements) {
    const info = getElementInfo(el);
    const line = info.node.getStartLineNumber();
    const column = info.node.getStartLinePos();

    checkRegistryUsage(info.tagName, info.node, options.registry, line, column, issues);
    checkPropNaming(info.attributes, line, column, issues);
    checkPropCount(info.attributes, options.maxProps, line, column, issues);
    checkDirectChildren(el, options.maxDirectChildren, line, column, issues);
    checkPropSpreading(info.attributes, info.tagName, line, column, issues);
    checkVariantHacking(info.tagName, info.attributes, line, column, issues);
  }

  checkMissingLoadingState(node, elements, issues);
  checkMissingErrorState(node, issues);

  const depth = computeMaxNestingDepth(node);
  if (depth > options.maxJsxNestingDepth) {
    issues.push({
      ruleId: "deep-jsx-nesting",
      category: "component",
      severity: "medium",
      message: `JSX nesting depth (${depth}) exceeds limit (${options.maxJsxNestingDepth})`,
      line: node.getStartLineNumber(),
      column: node.getStartLinePos(),
      advice: "Extract nested markup into smaller sub-components.",
    });
  }

  return issues;
}

function checkFileLength(
  node: ComponentNode,
  maxLines: number,
  issues: Issue[]
): void {
  const startLine = node.getStartLineNumber();
  const endLine = node.getEndLineNumber();
  const lines = endLine - startLine + 1;
  if (lines > maxLines) {
    issues.push({
      ruleId: "component-too-long",
      category: "architecture",
      severity: "medium",
      message: `Component spans ${lines} lines (limit ${maxLines})`,
      line: startLine,
      column: node.getStartLinePos(),
      advice: "Split the component into smaller, focused pieces.",
    });
  }
}

function checkRegistryUsage(
  tagName: string,
  node: JsxElement | JsxSelfClosingElement,
  registry: Record<string, string[]>,
  line: number,
  column: number,
  issues: Issue[]
): void {
  const semanticKey = tagName.toLowerCase();
  const roleKey = getRole(node)?.toLowerCase();

  const preferred = registry[semanticKey] ?? (roleKey ? registry[roleKey] : undefined);
  if (!preferred) return;

  // Only flag native/unknown elements (lowercase tag names), not custom components.
  if (tagName !== tagName.toLowerCase()) return;

  if (!preferred.includes(tagName)) {
    issues.push({
      ruleId: "missing-registry-component",
      category: "component",
      severity: "high",
      message: `Native <${tagName}> should use ${preferred.join(" or ")}`,
      line,
      column,
      advice: `Use the design-system component instead of a native <${tagName}>`,
    });
  }
}

function getRole(node: JsxElement | JsxSelfClosingElement): string | undefined {
  const attributes =
    node.getKind() === SyntaxKind.JsxElement
      ? (node as JsxElement).getOpeningElement().getAttributes()
      : (node as JsxSelfClosingElement).getAttributes();

  for (const attr of attributes) {
    if (attr.getKind() !== SyntaxKind.JsxAttribute) continue;
    const jsxAttr = attr as JsxAttribute;
    if (jsxAttr.getNameNode().getText() !== "role") continue;

    const init = jsxAttr.getInitializer();
    if (!init) continue;
    const value =
      init.getKind() === SyntaxKind.JsxExpression
        ? (init as JsxExpression).getExpression()?.getText().replace(/^["']|["']$/g, "")
        : init.getText().replace(/^["']|["']$/g, "");
    return value;
  }

  return undefined;
}

function checkPropNaming(
  attributes: JsxAttributeLike[],
  line: number,
  column: number,
  issues: Issue[]
): void {
  for (const attr of attributes) {
    if (attr.getKind() !== SyntaxKind.JsxAttribute) continue;
    const jsxAttr = attr as JsxAttribute;
    const name = jsxAttr.getNameNode().getText();
    if (!name) continue;

    // Allow data-* and aria-* kebab-case attributes, and standard JSX spread props.
    if (name.startsWith("data-") || name.startsWith("aria-")) continue;

    // Flag snake_case or kebab-case prop names (other than data/aria).
    if (/[A-Z]/.test(name)) continue; // camelCase / PascalCase are fine
    if (/_/.test(name) || /-/.test(name)) {
      issues.push({
        ruleId: "inconsistent-prop-naming",
        category: "component",
        severity: "low",
        message: `Prop "${name}" does not follow camelCase convention`,
        line: attr.getStartLineNumber(),
        column: attr.getStartLinePos(),
        advice: "Use camelCase for component props.",
      });
    }
  }
}

function checkPropCount(
  attributes: JsxAttributeLike[],
  maxProps: number,
  line: number,
  column: number,
  issues: Issue[]
): void {
  const propCount = attributes.filter((a) => a.getKind() === SyntaxKind.JsxAttribute).length;
  if (propCount > maxProps) {
    issues.push({
      ruleId: "too-many-props",
      category: "component",
      severity: "medium",
      message: `${propCount} props on a single element (limit ${maxProps})`,
      line,
      column,
      advice: "Group related props into objects or compose smaller components.",
    });
  }
}

function checkDirectChildren(
  el: JsxElement | JsxSelfClosingElement,
  maxDirectChildren: number,
  line: number,
  column: number,
  issues: Issue[]
): void {
  if (el.getKind() === SyntaxKind.JsxSelfClosingElement) return;

  const children = (el as JsxElement)
    .getJsxChildren()
    .filter(
      (child) =>
        child.getKind() === SyntaxKind.JsxElement ||
        child.getKind() === SyntaxKind.JsxSelfClosingElement ||
        child.getKind() === SyntaxKind.JsxExpression
    );

  if (children.length > maxDirectChildren) {
    issues.push({
      ruleId: "too-many-direct-children",
      category: "component",
      severity: "low",
      message: `${children.length} direct children (limit ${maxDirectChildren})`,
      line,
      column,
      advice: "Break the element into smaller layout components.",
    });
  }
}

function computeMaxNestingDepth(
  node: ComponentNode
): number {
  const elements = getJsxElements(node);
  if (elements.length === 0) return 0;

  let maxDepth = 0;
  for (const root of elements) {
    maxDepth = Math.max(maxDepth, nestingDepth(root, 1));
  }
  return maxDepth;
}

function nestingDepth(
  el: JsxElement | JsxSelfClosingElement,
  currentDepth: number
): number {
  if (el.getKind() === SyntaxKind.JsxSelfClosingElement) return currentDepth;

  let maxDepth = currentDepth;
  for (const child of (el as JsxElement).getJsxChildren()) {
    if (
      child.getKind() === SyntaxKind.JsxElement ||
      child.getKind() === SyntaxKind.JsxSelfClosingElement
    ) {
      const childEl = child as JsxElement | JsxSelfClosingElement;
      maxDepth = Math.max(maxDepth, nestingDepth(childEl, currentDepth + 1));
    }
  }
  return maxDepth;
}

function checkPropSpreading(
  attributes: JsxAttributeLike[],
  tagName: string,
  line: number,
  column: number,
  issues: Issue[]
): void {
  const hasSpread = attributes.some((a) => a.getKind() === SyntaxKind.JsxSpreadAttribute);
  if (!hasSpread) return;

  issues.push({
    ruleId: "prop-spreading-abuse",
    category: "component",
    severity: "medium",
    message: `{...props} spread on <${tagName}> can mask design-system variants`,
    line,
    column,
    advice: "Destructure only the props you need or compose variants explicitly.",
  });
}

function checkVariantHacking(
  tagName: string,
  attributes: JsxAttributeLike[],
  line: number,
  column: number,
  issues: Issue[]
): void {
  // Only flag custom (PascalCase) components.
  if (!tagName || tagName[0] !== tagName[0].toUpperCase()) return;

  const classNameAttr = attributes.find((a) => {
    if (a.getKind() !== SyntaxKind.JsxAttribute) return false;
    return a.asKind(SyntaxKind.JsxAttribute)?.getNameNode().getText() === "className";
  });
  if (!classNameAttr) return;

  const hasVariant = attributes.some((a) => {
    if (a.getKind() !== SyntaxKind.JsxAttribute) return false;
    return a.asKind(SyntaxKind.JsxAttribute)?.getNameNode().getText() === "variant";
  });

  const classText = classNameAttr.getText();
  const looksLikeOverride =
    hasVariant ||
    classText.includes("[") ||
    classText.includes("?") ||
    classText.includes("`${") ||
    classText.includes("cn(") ||
    classText.includes("classNames(");

  if (!looksLikeOverride) return;

  issues.push({
    ruleId: "variant-hacking-via-className",
    category: "component",
    severity: "medium",
    message: `className passed to <${tagName}> may override design-system variants`,
    line,
    column,
    advice: "Use the component's variant/size props instead of overriding className.",
  });
}

function checkMissingLoadingState(
  node: ComponentNode,
  elements: (JsxElement | JsxSelfClosingElement)[],
  issues: Issue[]
): void {
  if (hasLoadingGuard(node)) return;

  const mappedProps = collectMappedPropNames(elements);
  if (mappedProps.length === 0) return;

  issues.push({
    ruleId: "missing-loading-state",
    category: "component",
    severity: "medium",
    message: `Rendered prop data (${mappedProps.join(", ")}) without a loading fallback`,
    line: node.getStartLineNumber(),
    column: node.getStartLinePos(),
    advice: "Add a branch for loading or undefined data before mapping over props.",
  });
}

function hasLoadingGuard(node: ComponentNode): boolean {
  const text = node.getText();
  return /\b(loading|isLoading|pending|isPending)\b/.test(text) || /!\s*\w+\s*\|\|/.test(text);
}

function collectMappedPropNames(elements: (JsxElement | JsxSelfClosingElement)[]): string[] {
  const names = new Set<string>();
  for (const el of elements) {
    const expressions = el.getDescendantsOfKind(SyntaxKind.JsxExpression);
    for (const expr of expressions) {
      const call = expr.getExpression();
      if (!call || call.getKind() !== SyntaxKind.CallExpression) continue;
      const propAccess = call.getChildAtIndex(0);
      if (!propAccess || propAccess.getKind() !== SyntaxKind.PropertyAccessExpression) continue;
      const method = propAccess.asKind(SyntaxKind.PropertyAccessExpression)?.getName();
      if (method !== "map") continue;
      const obj = propAccess.asKind(SyntaxKind.PropertyAccessExpression)?.getExpression();
      if (!obj) continue;
      const text = obj.getText();
      // Heuristic: mapping over a prop (starts lowercase) rather than a local constant.
      if (/^[a-z]/.test(text)) {
        names.add(text);
      }
    }
  }
  return Array.from(names);
}

function checkMissingErrorState(
  node: ComponentNode,
  issues: Issue[]
): void {
  const calls = node.getDescendantsOfKind(SyntaxKind.CallExpression);
  const fetches = calls.filter((c) =>
    ["useQuery", "useSWR", "useFetch", "useLoaderData", "useActionData", "useSuspenseQuery"].includes(
      c.getExpression().getText()
    )
  );
  if (fetches.length === 0) return;

  const text = node.getText();
  const hasErrorBranch = /\b(error|isError|errorMessage)\b/.test(text);
  if (hasErrorBranch) return;

  issues.push({
    ruleId: "missing-error-state",
    category: "component",
    severity: "low",
    message: "Data-fetching component has no visible error branch",
    line: fetches[0].getStartLineNumber(),
    column: fetches[0].getStartLinePos(),
    advice: "Render an error fallback when a data request fails.",
  });
}
