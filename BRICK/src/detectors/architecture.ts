import {
  FunctionDeclaration,
  ArrowFunction,
  FunctionExpression,
  SyntaxKind,
  ImportDeclaration,
  Node,
  SourceFile,
  VariableDeclaration,
  CallExpression,
} from "ts-morph";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Issue } from "../types.js";
import type { ComponentNodeOrPlaceholder } from "../extractor/component.js";
import { isPlaceholder } from "../extractor/component.js";

type ComponentNode = FunctionDeclaration | ArrowFunction | FunctionExpression;

export interface ArchitectureOptions {
  projectPath?: string;
  fileText?: string;
}

const NODE_BUILTINS = new Set([
  "assert",
  "async_hooks",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "diagnostics_channel",
  "dns",
  "domain",
  "events",
  "fs",
  "http",
  "http2",
  "https",
  "inspector",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "repl",
  "stream",
  "string_decoder",
  "sys",
  "timers",
  "tls",
  "trace_events",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "wasi",
  "worker_threads",
  "zlib",
]);

const PLACEHOLDER_PATTERNS = [
  /lorem\s+ipsum/i,
  /your\s+company/i,
  /example\s+inc/i,
  /build\s+faster\s+with\s+ai/i,
  /operational\s+clarity/i,
  /get\s+started\s+today/i,
  /empower\s+your\s+team/i,
];

const REDUNDANT_COMMENT_PATTERNS = [
  /generated\s+by\s+ai/i,
  /todo:\s*add\s+real\s+data/i,
  /this\s+component\s+(handles?|renders?|displays?)/i,
  /\/\/\s*component\s+that/i,
];

export function detectArchitectureSlop(
  node: ComponentNodeOrPlaceholder,
  options: ArchitectureOptions = {}
): Issue[] {
  const issues: Issue[] = [];
  const projectPath = options.projectPath ?? process.cwd();

  if (isPlaceholder(node) || options.fileText !== undefined) {
    const text = options.fileText ?? node.getText();
    const sourcePath = node.getSourceFile().getFilePath();
    checkHallucinatedImportsFromText(text, sourcePath, projectPath, issues);
    checkPlaceholderCopyFromText(text, node.getStartLineNumber(), issues);
    return issues;
  }

  const source = (node as ComponentNode).getSourceFile();

  checkHallucinatedImports(source, projectPath, issues);
  checkUnresolvedIcons(node as ComponentNode, issues);
  checkAnyAnnotations(node as ComponentNode, issues);
  checkRedundantAiComments(node as ComponentNode, issues);
  checkPlaceholderCopy(node as ComponentNode, issues);
  checkInlineDataArrays(node as ComponentNode, issues);
  checkDeadStateSetters(node as ComponentNode, issues);
  checkConfidenceWithoutEvidence(node as ComponentNode, issues);
  checkSemanticLandmarks(node as ComponentNode, issues);
  checkPresentationComponentWithDataFetching(node as ComponentNode, issues);

  return issues;
}

const IMPORT_RE = /import\s+.*?\s+from\s+["']([^"']+)["']/g;

function checkHallucinatedImportsFromText(
  text: string,
  sourcePath: string,
  projectPath: string,
  issues: Issue[]
): void {
  const packageJsonPath = join(projectPath, "package.json");
  const deps = readDependencyNames(packageJsonPath);

  let match: RegExpExecArray | null;
  IMPORT_RE.lastIndex = 0;
  while ((match = IMPORT_RE.exec(text)) !== null) {
    const sourcePathValue = match[1];
    if (!sourcePathValue) continue;
    if (sourcePathValue.startsWith(".") || sourcePathValue.startsWith("/")) continue;

    const packageName = getPackageName(sourcePathValue);
    if (NODE_BUILTINS.has(packageName)) continue;
    if (deps.has(packageName)) continue;

    // Approximate line number from text offset.
    const line = text.slice(0, match.index).split("\n").length;
    issues.push({
      ruleId: "hallucinated-import",
      category: "architecture",
      severity: "medium",
      message: `Import from "${sourcePathValue}" is not declared in package.json dependencies`,
      line,
      column: 0,
      advice: "Remove the import or add the package to dependencies.",
    });
  }
}

function checkHallucinatedImports(
  source: SourceFile,
  projectPath: string,
  issues: Issue[]
): void {
  const packageJsonPath = join(projectPath, "package.json");
  const deps = readDependencyNames(packageJsonPath);

  for (const importDecl of source.getImportDeclarations()) {
    const sourcePath = importDecl.getModuleSpecifierValue();
    if (!sourcePath) continue;
    if (sourcePath.startsWith(".") || sourcePath.startsWith("/")) continue;

    const packageName = getPackageName(sourcePath);
    if (NODE_BUILTINS.has(packageName)) continue;
    if (deps.has(packageName)) continue;

    issues.push({
      ruleId: "hallucinated-import",
      category: "architecture",
      severity: "medium",
      message: `Import from "${sourcePath}" is not declared in package.json dependencies`,
      line: importDecl.getStartLineNumber(),
      column: importDecl.getStartLinePos(),
      advice: "Remove the import or add the package to dependencies.",
    });
  }
}

function readDependencyNames(packageJsonPath: string): Set<string> {
  const deps = new Set<string>();
  if (!existsSync(packageJsonPath)) return deps;

  try {
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    for (const section of [
      pkg.dependencies,
      pkg.devDependencies,
      pkg.peerDependencies,
    ]) {
      if (section) {
        for (const name of Object.keys(section)) deps.add(name);
      }
    }
  } catch {
    // Ignore malformed package.json.
  }
  return deps;
}

function getPackageName(specifier: string): string {
  if (specifier.startsWith("@")) {
    const parts = specifier.split("/");
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier;
  }
  return specifier.split("/")[0];
}

function checkUnresolvedIcons(
  node: ComponentNode,
  issues: Issue[]
): void {
  const iconComponents = node
    .getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)
    .filter((el) => el.getTagNameNode().getText() === "Icon");

  for (const el of iconComponents) {
    const nameAttr = el.getAttributes().find((a) => {
      if (a.getKind() !== SyntaxKind.JsxAttribute) return false;
      return a.asKind(SyntaxKind.JsxAttribute)?.getNameNode().getText() === "name";
    });
    if (nameAttr) {
      issues.push({
        ruleId: "unresolved-icon",
        category: "architecture",
        severity: "medium",
        message: "Icon component uses a string name prop",
        line: nameAttr.getStartLineNumber(),
        column: nameAttr.getStartLinePos(),
        advice: "Import explicit icon components from a known icon library.",
      });
    }
  }

  for (const attr of node.getDescendantsOfKind(SyntaxKind.JsxAttribute)) {
    const name = attr.getNameNode().getText();
    if (name !== "icon" && name !== "startIcon" && name !== "endIcon") continue;
    const init = attr.getInitializer();
    if (!init) continue;

    const value =
      init.getKind() === SyntaxKind.JsxExpression
        ? init.asKind(SyntaxKind.JsxExpression)?.getExpression()?.getText()
        : init.getText().replace(/^["']|["']$/g, "");

    if (value && /^["']/.test(value.trim())) {
      issues.push({
        ruleId: "unresolved-icon",
        category: "architecture",
        severity: "medium",
        message: `String icon prop "${name}" may reference an unresolved icon`,
        line: attr.getStartLineNumber(),
        column: attr.getStartLinePos(),
        advice: "Use typed icon components instead of string icon names.",
      });
    }
  }
}

function checkAnyAnnotations(
  node: ComponentNode,
  issues: Issue[]
): void {
  const anyTypes = node
    .getDescendantsOfKind(SyntaxKind.AnyKeyword)
    .filter((n) => isRelevantAnyLocation(n));

  for (const anyNode of anyTypes) {
    issues.push({
      ruleId: "any-annotation",
      category: "architecture",
      severity: "medium",
      message: "`any` type annotation disables type safety",
      line: anyNode.getStartLineNumber(),
      column: anyNode.getStartLinePos(),
      advice: "Replace `any` with a specific type or `unknown` with narrowing.",
    });
  }
}

function isRelevantAnyLocation(node: Node): boolean {
  const parent = node.getParent();
  if (!parent) return false;
  const kind = parent.getKind();
  return (
    kind === SyntaxKind.Parameter ||
    kind === SyntaxKind.VariableDeclaration ||
    kind === SyntaxKind.PropertySignature ||
    kind === SyntaxKind.TypeAliasDeclaration ||
    kind === SyntaxKind.AsExpression ||
    kind === SyntaxKind.TypeAssertionExpression
  );
}

function checkRedundantAiComments(
  node: ComponentNode,
  issues: Issue[]
): void {
  for (const comment of node.getDescendantsOfKind(SyntaxKind.SingleLineCommentTrivia)) {
    const text = comment.getText();
    if (REDUNDANT_COMMENT_PATTERNS.some((p) => p.test(text))) {
      issues.push({
        ruleId: "redundant-ai-comment",
        category: "architecture",
        severity: "low",
        message: "Redundant or generated comment detected",
        line: comment.getStartLineNumber(),
        column: comment.getStartLinePos(),
        advice: "Delete self-evident or generated comments.",
      });
    }
  }

  for (const comment of node.getDescendantsOfKind(SyntaxKind.MultiLineCommentTrivia)) {
    const text = comment.getText();
    if (REDUNDANT_COMMENT_PATTERNS.some((p) => p.test(text))) {
      issues.push({
        ruleId: "redundant-ai-comment",
        category: "architecture",
        severity: "low",
        message: "Redundant or generated comment detected",
        line: comment.getStartLineNumber(),
        column: comment.getStartLinePos(),
        advice: "Delete self-evident or generated comments.",
      });
    }
  }
}

function checkPlaceholderCopyFromText(
  text: string,
  startLine: number,
  issues: Issue[]
): void {
  for (const pattern of PLACEHOLDER_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      issues.push({
        ruleId: "placeholder-copy",
        category: "architecture",
        severity: "medium",
        message: `Placeholder copy detected: "${match[0]}"`,
        line: startLine,
        column: 0,
        advice: "Replace placeholder text with real, reviewed copy.",
      });
    }
  }
}

function checkPlaceholderCopy(
  node: ComponentNode,
  issues: Issue[]
): void {
  const strings = node.getDescendantsOfKind(SyntaxKind.StringLiteral);
  for (const str of strings) {
    const text = str.getLiteralValue();
    if (PLACEHOLDER_PATTERNS.some((p) => p.test(text))) {
      issues.push({
        ruleId: "placeholder-copy",
        category: "architecture",
        severity: "medium",
        message: `Placeholder copy detected: "${text}"`,
        line: str.getStartLineNumber(),
        column: str.getStartLinePos(),
        advice: "Replace placeholder text with real, reviewed copy.",
      });
    }
  }

  const jsxTexts = node.getDescendantsOfKind(SyntaxKind.JsxText);
  for (const textNode of jsxTexts) {
    const text = textNode.getText().trim();
    if (text && PLACEHOLDER_PATTERNS.some((p) => p.test(text))) {
      issues.push({
        ruleId: "placeholder-copy",
        category: "architecture",
        severity: "medium",
        message: `Placeholder copy detected: "${text}"`,
        line: textNode.getStartLineNumber(),
        column: textNode.getStartLinePos(),
        advice: "Replace placeholder text with real, reviewed copy.",
      });
    }
  }
}

function checkInlineDataArrays(
  node: ComponentNode,
  issues: Issue[]
): void {
  const mapCalls = node
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((call) => {
      const expr = call.getExpression();
      return (
        expr.getKind() === SyntaxKind.PropertyAccessExpression &&
        expr.getText().endsWith(".map")
      );
    });

  for (const call of mapCalls) {
    const propAccess = call.getExpression().asKind(SyntaxKind.PropertyAccessExpression);
    if (!propAccess) continue;
    const obj = propAccess.getExpression();
    if (obj.getKind() === SyntaxKind.ArrayLiteralExpression) {
      const elements = obj.asKind(SyntaxKind.ArrayLiteralExpression)?.getElements() ?? [];
      if (elements.length >= 3) {
        issues.push({
          ruleId: "inline-data-array",
          category: "architecture",
          severity: "medium",
          message: "Large inline data array mapped inside JSX",
          line: obj.getStartLineNumber(),
          column: obj.getStartLinePos(),
          advice: "Move demo data to a separate file or data hook.",
        });
      }
    }
  }
}

function checkDeadStateSetters(
  node: ComponentNode,
  issues: Issue[]
): void {
  const useStateCalls = node
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((c) => c.getExpression().getText() === "useState");

  for (const call of useStateCalls) {
    const declaration = findStateDeclaration(call);
    if (!declaration) continue;

    const binding = declaration.getNameNode();
    if (binding.getKind() !== SyntaxKind.ArrayBindingPattern) continue;

    const elements = binding.asKind(SyntaxKind.ArrayBindingPattern)?.getElements() ?? [];
    if (elements.length < 2) continue;

    const setter = elements[1];
    if (setter.getKind() !== SyntaxKind.BindingElement) continue;
    const setterName = setter.asKind(SyntaxKind.BindingElement)?.getNameNode().getText();
    if (!setterName) continue;

    const setterCalls = node
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .filter(
        (c) =>
          c.getExpression().getText() === setterName &&
          c.getStartLineNumber() !== setter.getStartLineNumber()
      );

    if (setterCalls.length === 0) {
      issues.push({
        ruleId: "dead-state-setter",
        category: "logic",
        severity: "medium",
        message: `State setter "${setterName}" is never called`,
        line: setter.getStartLineNumber(),
        column: setter.getStartLinePos(),
        advice: "Remove unused state or wire the setter to an interaction.",
      });
    }
  }
}

function findStateDeclaration(
  call: CallExpression
): VariableDeclaration | undefined {
  const parent = call.getParent();
  if (!parent) return undefined;

  if (parent.getKind() === SyntaxKind.VariableDeclaration) {
    return parent.asKind(SyntaxKind.VariableDeclaration);
  }

  if (parent.getKind() === SyntaxKind.ArrayBindingPattern) {
    const bindingParent = parent.getParent();
    if (bindingParent?.getKind() === SyntaxKind.VariableDeclaration) {
      return bindingParent.asKind(SyntaxKind.VariableDeclaration);
    }
  }

  return undefined;
}

function checkConfidenceWithoutEvidence(
  node: ComponentNode,
  issues: Issue[]
): void {
  const confidenceProps = ["isPremium", "isPro", "plan", "tier"];

  for (const attr of node.getDescendantsOfKind(SyntaxKind.JsxAttribute)) {
    const name = attr.getNameNode().getText();
    if (!confidenceProps.includes(name)) continue;

    const init = attr.getInitializer();
    if (!init) continue;

    const value =
      init.getKind() === SyntaxKind.JsxExpression
        ? init.asKind(SyntaxKind.JsxExpression)?.getExpression()
        : init;

    if (
      value &&
      (value.getKind() === SyntaxKind.TrueKeyword ||
        value.getKind() === SyntaxKind.FalseKeyword ||
        value.getKind() === SyntaxKind.StringLiteral)
    ) {
      issues.push({
        ruleId: "confidence-without-evidence",
        category: "architecture",
        severity: "medium",
        message: `Hardcoded "${name}" prop simulates feature gating without evidence`,
        line: attr.getStartLineNumber(),
        column: attr.getStartLinePos(),
        advice: "Drive feature gating from real user data or configuration.",
      });
    }
  }
}

function getComponentName(node: ComponentNode): string {
  if (node.getKind() === SyntaxKind.FunctionDeclaration) {
    return node.asKind(SyntaxKind.FunctionDeclaration)?.getName() ?? "";
  }
  const parent = node.getParent();
  if (parent?.getKind() === SyntaxKind.VariableDeclaration) {
    return parent.asKind(SyntaxKind.VariableDeclaration)?.getName() ?? "";
  }
  return "";
}

const LANDMARK_TAGS = new Set(["main", "header", "nav", "footer", "aside"]);
const PAGE_COMPONENT_PATTERN = /Page|Layout|Screen|Home|Dashboard|Landing/i;

function checkSemanticLandmarks(
  node: ComponentNode,
  issues: Issue[]
): void {
  const name = getComponentName(node);
  const sourcePath = node.getSourceFile().getFilePath();
  const isPageLike =
    PAGE_COMPONENT_PATTERN.test(name) ||
    /(\/pages\/|\/app\/)/.test(sourcePath);
  if (!isPageLike) return;

  const elements = node.getDescendantsOfKind(SyntaxKind.JsxElement);
  const hasLandmark = elements.some((el) => {
    const tag = el.getOpeningElement().getTagNameNode().getText().toLowerCase();
    return LANDMARK_TAGS.has(tag);
  });

  if (!hasLandmark) {
    issues.push({
      ruleId: "missing-semantic-landmarks",
      category: "architecture",
      severity: "low",
      message: "Page-like component lacks semantic landmarks",
      line: node.getStartLineNumber(),
      column: node.getStartLinePos(),
      advice: "Wrap page regions in <main>, <header>, <nav>, or <footer>.",
    });
  }
}

const DATA_FETCHING_HOOKS = new Set([
  "useQuery",
  "useQueries",
  "useSWR",
  "useSWRInfinite",
  "useFetch",
  "useLoaderData",
  "useActionData",
  "useSuspenseQuery",
  "useSuspenseInfiniteQuery",
  "useInfiniteQuery",
]);

function checkPresentationComponentWithDataFetching(
  node: ComponentNode,
  issues: Issue[]
): void {
  const hasJsx =
    node.getDescendantsOfKind(SyntaxKind.JsxElement).length > 0 ||
    node.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement).length > 0;
  if (!hasJsx) return;

  const calls = node.getDescendantsOfKind(SyntaxKind.CallExpression);
  const fetchCall = calls.find((c) => {
    const name = c.getExpression().getText();
    return DATA_FETCHING_HOOKS.has(name);
  });

  if (!fetchCall) return;

  issues.push({
    ruleId: "presentation-component-with-data-fetching",
    category: "architecture",
    severity: "high",
    message: "Component both renders UI and fetches data",
    line: fetchCall.getStartLineNumber(),
    column: fetchCall.getStartLinePos(),
    advice: "Move data fetching into a dedicated container/hook and keep UI components presentational.",
  });
}
