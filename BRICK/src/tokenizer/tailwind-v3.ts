import { readFileSync } from "node:fs";
import { Project, SyntaxKind, type ObjectLiteralExpression } from "ts-morph";
import type { DesignTokens, TokenValue, ColorToken } from "../types.js";
import { parseNumericValue } from "./units.js";
import { parseColor } from "./oklch.js";

export function extractTailwindV3(filePath: string): DesignTokens {
  const source = readFileSync(filePath, "utf-8");

  // ts-morph needs a file path on disk; write to a temp virtual project by adding source text.
  const project = new Project({ useInMemoryFileSystem: true });
  const sf = project.createSourceFile("tailwind.config.ts", source, { overwrite: true });

  const tokens: DesignTokens = {
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

  const config = findConfigObject(sf);
  if (!config) return tokens;
  const themeProp = config.getProperty("theme");
  const theme = themeProp?.asKind(SyntaxKind.PropertyAssignment)
    ?.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);

  if (!theme) return tokens;

  tokens.spacing = extractTokenValues(theme, "spacing");
  tokens.radii = extractTokenValues(theme, "borderRadius");
  tokens.fontSizes = extractTokenValues(theme, "fontSize");
  tokens.lineHeights = extractNumericArray(theme, "lineHeight");
  tokens.letterSpacing = extractEmArray(theme, "letterSpacing");
  tokens.fontWeights = extractNumericArray(theme, "fontWeight");
  tokens.fontFamilies = extractStringArray(theme, "fontFamily");
  tokens.zIndex = extractNumericArray(theme, "zIndex");
  tokens.shadows = extractStringArray(theme, "boxShadow");
  tokens.colors = extractColors(theme, "colors");

  // Theme values inside `extend` should also be picked up.
  const extendProp = theme.getProperty("extend");
  const extend = extendProp?.asKind(SyntaxKind.PropertyAssignment)
    ?.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);

  if (extend) {
    tokens.spacing.push(...extractTokenValues(extend, "spacing"));
    tokens.radii.push(...extractTokenValues(extend, "borderRadius"));
    tokens.fontSizes.push(...extractTokenValues(extend, "fontSize"));
    tokens.lineHeights.push(...extractNumericArray(extend, "lineHeight"));
    tokens.letterSpacing.push(...extractEmArray(extend, "letterSpacing"));
    tokens.fontWeights.push(...extractNumericArray(extend, "fontWeight"));
    tokens.fontFamilies.push(...extractStringArray(extend, "fontFamily"));
    tokens.zIndex.push(...extractNumericArray(extend, "zIndex"));
    tokens.shadows.push(...extractStringArray(extend, "boxShadow"));
    tokens.colors.push(...extractColors(extend, "colors"));
  }

  return tokens;
}

function findConfigObject(sf: import("ts-morph").SourceFile): ObjectLiteralExpression | undefined {
  // ESM/TS: export default { ... }
  const exportAssignment = sf.getExportAssignment((n) => !n.isExportEquals());
  const exported = exportAssignment?.getExpression();
  if (exported?.asKind(SyntaxKind.ObjectLiteralExpression)) {
    return exported.asKind(SyntaxKind.ObjectLiteralExpression);
  }

  // CommonJS: module.exports = { ... }
  for (const statement of sf.getStatements()) {
    if (statement.getKind() !== SyntaxKind.ExpressionStatement) continue;
    const expr = statement.asKind(SyntaxKind.ExpressionStatement)?.getExpression();
    if (!expr || expr.getKind() !== SyntaxKind.BinaryExpression) continue;
    const bin = expr.asKindOrThrow(SyntaxKind.BinaryExpression);
    if (bin.getLeft().getText() === "module.exports" && bin.getOperatorToken().getText() === "=") {
      const right = bin.getRight().asKind(SyntaxKind.ObjectLiteralExpression);
      if (right) return right;
    }
  }

  return undefined;
}

function extractTokenValues(obj: ObjectLiteralExpression, key: string): TokenValue[] {
  const prop = obj.getProperty(key);
  const init = prop?.asKind(SyntaxKind.PropertyAssignment)
    ?.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
  if (!init) return [];

  const out: TokenValue[] = [];
  for (const p of init.getProperties()) {
    const assignment = p.asKind(SyntaxKind.PropertyAssignment);
    if (!assignment) continue;
    const name = assignment.getName();
    const valueNode = assignment.getInitializer();
    const raw = valueNode?.getText().replace(/^["']|["']$/g, "") ?? "";
    const parsed = parseNumericValue(raw);
    if (parsed) {
      out.push({ ...parsed, raw });
    }
  }
  return out;
}

function extractNumericArray(obj: ObjectLiteralExpression, key: string): number[] {
  const prop = obj.getProperty(key);
  const init = prop?.asKind(SyntaxKind.PropertyAssignment)
    ?.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
  if (!init) return [];

  const out: number[] = [];
  for (const p of init.getProperties()) {
    const assignment = p.asKind(SyntaxKind.PropertyAssignment);
    if (!assignment) continue;
    const valueNode = assignment.getInitializer();
    const n = Number(valueNode?.getText().replace(/^["']|["']$/g, ""));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

function extractStringArray(obj: ObjectLiteralExpression, key: string): string[] {
  const prop = obj.getProperty(key);
  const init = prop?.asKind(SyntaxKind.PropertyAssignment)
    ?.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
  if (!init) return [];

  const out: string[] = [];
  for (const p of init.getProperties()) {
    const assignment = p.asKind(SyntaxKind.PropertyAssignment);
    if (!assignment) continue;
    const valueNode = assignment.getInitializer();
    const raw = valueNode?.getText().replace(/^["']|["']$/g, "") ?? "";
    if (raw) out.push(raw);
  }
  return out;
}

function extractEmArray(obj: ObjectLiteralExpression, key: string): number[] {
  const prop = obj.getProperty(key);
  const init = prop?.asKind(SyntaxKind.PropertyAssignment)
    ?.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
  if (!init) return [];

  const out: number[] = [];
  for (const p of init.getProperties()) {
    const assignment = p.asKind(SyntaxKind.PropertyAssignment);
    if (!assignment) continue;
    const valueNode = assignment.getInitializer();
    const raw = valueNode?.getText().replace(/^["']|["']$/g, "");
    if (!raw) continue;
    const m = /^([\d.-]+)em$/.exec(raw);
    if (m) {
      const n = parseFloat(m[1]);
      if (Number.isFinite(n)) out.push(n);
    }
  }
  return out;
}

function extractColors(obj: ObjectLiteralExpression, key: string): ColorToken[] {
  const prop = obj.getProperty(key);
  const init = prop?.asKind(SyntaxKind.PropertyAssignment)
    ?.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
  if (!init) return [];

  const out: ColorToken[] = [];
  for (const p of init.getProperties()) {
    const assignment = p.asKind(SyntaxKind.PropertyAssignment);
    if (!assignment) continue;
    const name = assignment.getName();
    const valueNode = assignment.getInitializer();
    const raw = valueNode?.getText().replace(/^["']|["']$/g, "") ?? "";
    out.push(parseColor(raw, name));
  }
  return out;
}
