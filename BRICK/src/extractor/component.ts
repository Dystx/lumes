import {
  Project,
  FunctionDeclaration,
  ArrowFunction,
  FunctionExpression,
  SyntaxKind,
  VariableDeclaration,
  Node,
} from "ts-morph";
import { readFileSync } from "node:fs";

export type ComponentNode = FunctionDeclaration | ArrowFunction | FunctionExpression;

export interface PlaceholderComponent {
  kind: "placeholder";
  filePath: string;
  text: string;
  name: string;
  line: number;
  column: number;
  getStartLineNumber(): number;
  getStartLinePos(): number;
  getEndLineNumber(): number;
  getText(): string;
  getSourceFile(): { getFilePath(): string };
  getDescendantsOfKind(): [];
  getDescendants(): [];
}

export type ComponentNodeOrPlaceholder = ComponentNode | PlaceholderComponent;

export function isPlaceholder(
  node: ComponentNodeOrPlaceholder
): node is PlaceholderComponent {
  return "kind" in node && node.kind === "placeholder";
}

export interface ComponentInfo {
  file: string;
  name: string;
  line: number;
  node: ComponentNodeOrPlaceholder;
}

const COMPONENT_EXTENSIONS = new Set([".tsx", ".jsx", ".ts", ".js"]);
const TEXT_COMPONENT_EXTENSIONS = new Set([".vue", ".svelte"]);

export function isTextComponentExtension(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return TEXT_COMPONENT_EXTENSIONS.has(lower.slice(lower.lastIndexOf(".")));
}

export function extractComponents(
  project: Project,
  textFilePaths?: string[]
): ComponentInfo[] {
  const components: ComponentInfo[] = [];

  for (const source of project.getSourceFiles()) {
    const filePath = source.getFilePath();
    if (!isComponentExtension(filePath)) continue;

    for (const fn of source.getFunctions()) {
      if (returnsJsx(fn)) {
        components.push({
          file: filePath,
          name: fn.getName() || "anonymous",
          line: fn.getStartLineNumber(),
          node: fn,
        });
      }
    }

    for (const decl of source.getVariableDeclarations()) {
      const arrow = decl.getInitializerIfKind(SyntaxKind.ArrowFunction);
      if (arrow && returnsJsx(arrow)) {
        components.push({
          file: filePath,
          name: decl.getName(),
          line: decl.getStartLineNumber(),
          node: arrow,
        });
        continue;
      }

      const fnExpr = decl.getInitializerIfKind(SyntaxKind.FunctionExpression);
      if (fnExpr && returnsJsx(fnExpr)) {
        components.push({
          file: filePath,
          name: decl.getName(),
          line: decl.getStartLineNumber(),
          node: fnExpr,
        });
        continue;
      }

      const forwardRef = extractForwardRefComponent(decl);
      if (forwardRef) {
        components.push({
          file: filePath,
          name: decl.getName(),
          line: decl.getStartLineNumber(),
          node: forwardRef,
        });
      }
    }
  }

  if (textFilePaths) {
    for (const filePath of textFilePaths) {
      if (!isTextComponentExtension(filePath)) continue;
      const component = extractTextComponent(filePath);
      if (component) components.push(component);
    }
  }

  return prioritizeTsx(components);
}

function isComponentExtension(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return COMPONENT_EXTENSIONS.has(lower.slice(lower.lastIndexOf(".")));
}

function prioritizeTsx(components: ComponentInfo[]): ComponentInfo[] {
  return components.sort((a, b) => {
    const aTsx = a.file.endsWith(".tsx");
    const bTsx = b.file.endsWith(".tsx");
    if (aTsx && !bTsx) return -1;
    if (!aTsx && bTsx) return 1;
    return 0;
  });
}

function extractForwardRefComponent(
  decl: VariableDeclaration
): ComponentNode | undefined {
  const init = decl.getInitializer();
  if (!init || init.getKind() !== SyntaxKind.CallExpression) return undefined;
  const call = init.asKind(SyntaxKind.CallExpression);
  if (!call) return undefined;

  const callee = call.getExpression();
  const calleeText = callee.getText();
  if (calleeText !== "forwardRef" && !calleeText.endsWith(".forwardRef")) return undefined;

  const arg = call.getArguments()[0];
  if (!arg) return undefined;

  if (arg.getKind() === SyntaxKind.ArrowFunction) {
    return arg.asKind(SyntaxKind.ArrowFunction);
  }
  if (arg.getKind() === SyntaxKind.FunctionExpression) {
    return arg.asKind(SyntaxKind.FunctionExpression);
  }
  return undefined;
}

function returnsJsx(fn: ComponentNode | Node): boolean {
  return (
    fn.getDescendantsOfKind(SyntaxKind.JsxElement).length > 0 ||
    fn.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement).length > 0 ||
    fn.getDescendantsOfKind(SyntaxKind.JsxFragment).length > 0
  );
}

function extractTextComponent(filePath: string): ComponentInfo | undefined {
  let text: string;
  try {
    text = readFileSync(filePath, "utf-8");
  } catch {
    return undefined;
  }

  const name = componentNameFromPath(filePath);
  const placeholder: PlaceholderComponent = {
    kind: "placeholder",
    filePath,
    text,
    name,
    line: 1,
    column: 0,
    getStartLineNumber: () => 1,
    getStartLinePos: () => 0,
    getEndLineNumber: () => text.split("\n").length,
    getText: () => text,
    getSourceFile: () => ({ getFilePath: () => filePath }),
    getDescendantsOfKind: () => [],
    getDescendants: () => [],
  };

  return {
    file: filePath,
    name,
    line: 1,
    node: placeholder,
  };
}

function componentNameFromPath(filePath: string): string {
  const base = filePath.split("/").pop() ?? "Anonymous";
  const withoutExt = base.replace(/\.(vue|svelte)$/i, "");
  return withoutExt.charAt(0).toUpperCase() + withoutExt.slice(1);
}

const CLASS_ATTR_RE = /\bclass(?:Name)?\s*=\s*["']([^"']+)["']/g;
const VUE_TEMPLATE_RE = /<template[^>]*>([\s\S]*?)<\/template>/i;

export function extractClassNamesFromText(text: string): string[] {
  // For Vue files, prefer the template block; otherwise scan the whole file.
  const templateMatch = VUE_TEMPLATE_RE.exec(text);
  const scanText = templateMatch ? templateMatch[1] : text;
  const classes = new Set<string>();
  let match: RegExpExecArray | null;
  CLASS_ATTR_RE.lastIndex = 0;
  while ((match = CLASS_ATTR_RE.exec(scanText)) !== null) {
    for (const utility of match[1].split(/\s+/)) {
      const trimmed = utility.trim();
      if (trimmed) classes.add(trimmed);
    }
  }
  return Array.from(classes);
}
