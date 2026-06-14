import {
  FunctionDeclaration,
  ArrowFunction,
  FunctionExpression,
  SyntaxKind,
  JsxElement,
  JsxSelfClosingElement,
  JsxAttributeLike,
  JsxChild,
} from "ts-morph";
import type { Issue } from "../types.js";
import { getElementInfo, getJsxElements } from "./helpers.js";

type ComponentNode = FunctionDeclaration | ArrowFunction | FunctionExpression;

export interface A11yOptions {
  /** Minimum number of inline style props before flagging generic-style-prop. */
  stylePropThreshold?: number;
}

export function detectA11ySlop(
  node: ComponentNode,
  _options?: A11yOptions
): Issue[] {
  const issues: Issue[] = [];

  for (const el of getJsxElements(node)) {
    const info = getElementInfo(el);
    const line = info.node.getStartLineNumber();
    const column = info.node.getStartLinePos();

    checkClickableDivs(info.tagName, info.attributes, info.node, line, column, issues);
    checkMissingAlt(info.tagName, info.attributes, info.node, line, column, issues);
    checkIconButtonLabel(info.tagName, info.attributes, el, line, column, issues);
    checkVisualOnlyHeading(info.tagName, info.attributes, el, line, column, issues);
  }

  return issues;
}

function checkClickableDivs(
  tagName: string,
  attributes: JsxAttributeLike[],
  node: JsxElement | JsxSelfClosingElement,
  line: number,
  column: number,
  issues: Issue[]
): void {
  if (tagName !== "div" && tagName !== "span") return;

  const hasOnClick = attributes.some(
    (a) =>
      a.getKind() === SyntaxKind.JsxAttribute &&
      a.asKind(SyntaxKind.JsxAttribute)?.getNameNode().getText() === "onClick"
  );
  if (!hasOnClick) return;

  const role = getAttributeValue(attributes, "role");
  if (role === "button") return;

  issues.push({
    ruleId: `${tagName}-on-click`,
    category: "component",
    severity: "high",
    message: `<${tagName}> with onClick is not keyboard accessible`,
    line,
    column,
    advice: `Use a <button> or add role="button" with tabindex and keyboard handlers.`,
  });
}

function checkMissingAlt(
  tagName: string,
  attributes: JsxAttributeLike[],
  node: JsxElement | JsxSelfClosingElement,
  line: number,
  column: number,
  issues: Issue[]
): void {
  if (tagName !== "img") return;

  const alt = getAttributeValue(attributes, "alt");
  const ariaLabel = getAttributeValue(attributes, "aria-label");
  if (alt !== undefined || ariaLabel !== undefined) return;

  issues.push({
    ruleId: "img-missing-alt",
    category: "component",
    severity: "high",
    message: "<img> is missing alt text",
    line,
    column,
    advice: "Add a descriptive alt prop or an aria-label for decorative images.",
  });
}

function checkIconButtonLabel(
  tagName: string,
  attributes: JsxAttributeLike[],
  node: JsxElement | JsxSelfClosingElement,
  line: number,
  column: number,
  issues: Issue[]
): void {
  if (tagName !== "button") return;

  const ariaLabel = getAttributeValue(attributes, "aria-label");
  if (ariaLabel !== undefined) return;

  const text = getElementTextContent(node);
  if (text.trim().length > 0) return;

  issues.push({
    ruleId: "icon-button-missing-label",
    category: "component",
    severity: "high",
    message: "Icon-only <button> has no accessible label",
    line,
    column,
    advice: "Add an aria-label to buttons that contain only icons.",
  });
}

function checkVisualOnlyHeading(
  tagName: string,
  attributes: JsxAttributeLike[],
  node: JsxElement | JsxSelfClosingElement,
  line: number,
  column: number,
  issues: Issue[]
): void {
  if (!/^h[1-6]$/.test(tagName)) return;

  const text = getElementTextContent(node);
  if (text.trim().length > 0) return;

  const ariaLabel = getAttributeValue(attributes, "aria-label");
  if (ariaLabel !== undefined) return;

  const className = getAttributeValue(attributes, "className") ?? "";
  const hasVisualStyle = /\b(text-[\w\[\]]+|font-bold|font-extrabold)\b/.test(className);
  if (!hasVisualStyle) return;

  issues.push({
    ruleId: "visual-only-heading",
    category: "typography",
    severity: "medium",
    message: "Heading appears to be used only for visual styling",
    line,
    column,
    advice: "Use a non-semantic element for visual styling or add meaningful heading text.",
  });
}

function getAttributeValue(
  attributes: JsxAttributeLike[],
  name: string
): string | undefined {
  for (const attr of attributes) {
    if (attr.getKind() !== SyntaxKind.JsxAttribute) continue;
    const jsxAttr = attr.asKind(SyntaxKind.JsxAttribute);
    if (!jsxAttr) continue;
    if (jsxAttr.getNameNode().getText() !== name) continue;

    const init = jsxAttr.getInitializer();
    if (!init) return "";

    if (init.getKind() === SyntaxKind.JsxExpression) {
      const expr = init.asKind(SyntaxKind.JsxExpression)?.getExpression();
      return expr?.getText() ?? "";
    }

    return init.getText().replace(/^["']|["']$/g, "");
  }
  return undefined;
}

function getElementTextContent(node: JsxElement | JsxSelfClosingElement): string {
  if (node.getKind() === SyntaxKind.JsxSelfClosingElement) return "";

  const children = (node as JsxElement).getJsxChildren();
  return children.map(getChildText).join("");
}

function getChildText(child: JsxChild): string {
  if (child.getKind() === SyntaxKind.JsxText) {
    return child.getText();
  }
  if (
    child.getKind() === SyntaxKind.JsxElement ||
    child.getKind() === SyntaxKind.JsxSelfClosingElement
  ) {
    return "";
  }
  if (child.getKind() === SyntaxKind.JsxExpression) {
    return child.getText();
  }
  return "";
}
