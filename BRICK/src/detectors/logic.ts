import {
  FunctionDeclaration,
  ArrowFunction,
  FunctionExpression,
  SyntaxKind,
  CallExpression,
  Node,
  VariableDeclaration,
  PropertyAccessExpression,
} from "ts-morph";
import type { Issue } from "../types.js";

type ComponentNode = FunctionDeclaration | ArrowFunction | FunctionExpression;

export interface LogicOptions {
  maxUseEffectPerComponent: number;
}

export function detectLogicSlop(
  node: ComponentNode,
  options: LogicOptions
): Issue[] {
  const issues: Issue[] = [];

  const effects = node
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((c) => c.getExpression().getText() === "useEffect");

  if (effects.length > options.maxUseEffectPerComponent) {
    issues.push({
      ruleId: "excessive-use-effect",
      category: "logic",
      severity: "medium",
      message: `${effects.length} useEffect calls in one component (limit ${options.maxUseEffectPerComponent})`,
      line: node.getStartLineNumber(),
      column: node.getStartLinePos(),
      advice: "Combine related effects or move logic outside the component.",
    });
  }

  for (const effect of effects) {
    checkGhostUseEffect(effect, issues);
  }

  checkInlineEventHandlers(node, issues);
  checkUnusedStateSetters(node, issues);
  checkBusinessLogicInJsx(node, issues);
  checkPropToStateSync(node, issues);
  checkZombieState(node, issues);
  checkPointlessMemo(node, issues);
  checkHandRolledUtility(node, issues);

  return issues;
}

function checkGhostUseEffect(effect: CallExpression, issues: Issue[]): void {
  const callback = effect.getArguments()[0];
  if (!callback) return;

  const body =
    callback.getKind() === SyntaxKind.ArrowFunction
      ? callback.asKind(SyntaxKind.ArrowFunction)?.getBody()
      : callback.getKind() === SyntaxKind.FunctionExpression
        ? callback.asKind(SyntaxKind.FunctionExpression)?.getBody()
        : undefined;

  if (!body || body.getKind() !== SyntaxKind.Block) return;
  const block = body.asKind(SyntaxKind.Block);
  if (!block) return;

  const statements = block.getStatements();
  if (statements.length === 1) {
    const text = statements[0].getText();
    if (/set[A-Z]\w*\s*\(/.test(text)) {
      issues.push({
        ruleId: "ghost-use-effect",
        category: "logic",
        severity: "high",
        message: "useEffect only calls setState",
        line: effect.getStartLineNumber(),
        column: effect.getStartLinePos(),
        advice: "Derive state from props instead of syncing with useEffect.",
      });
    }
  }
}

function checkInlineEventHandlers(
  node: ComponentNode,
  issues: Issue[]
): void {
  const jsxAttributes = node.getDescendantsOfKind(SyntaxKind.JsxAttribute);
  for (const attr of jsxAttributes) {
    const name = attr.getNameNode().getText();
    if (!/^on[A-Z]\w*$/.test(name)) continue;

    const init = attr.getInitializer();
    if (!init) continue;

    const handler =
      init.getKind() === SyntaxKind.JsxExpression
        ? init.asKind(SyntaxKind.JsxExpression)?.getExpression()
        : init;

    if (
      handler &&
      (handler.getKind() === SyntaxKind.ArrowFunction ||
        handler.getKind() === SyntaxKind.FunctionExpression)
    ) {
      const statements = countStatements(handler);
      const calls = countFunctionCalls(handler);
      const setters = countStateSetters(handler);
      if (statements > 3 || calls > 1 || setters > 1) {
        issues.push({
          ruleId: "inline-event-handler",
          category: "logic",
          severity: "medium",
          message: `Inline event handler for ${name}`,
          line: attr.getStartLineNumber(),
          column: attr.getStartLinePos(),
          advice: "Extract event handlers into named functions or hooks.",
        });
      }
    }
  }
}

function countStatements(node: Node): number {
  if (node.getKind() === SyntaxKind.Block) {
    return node.asKind(SyntaxKind.Block)?.getStatements().length ?? 0;
  }
  // Expression-bodied functions count as a single statement.
  return 1;
}

function countFunctionCalls(node: Node): number {
  return node.getDescendantsOfKind(SyntaxKind.CallExpression).length;
}

function countStateSetters(node: Node): number {
  return node
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((c) => /^set[A-Z]/.test(c.getExpression().getText())).length;
}

function checkUnusedStateSetters(
  node: ComponentNode,
  issues: Issue[]
): void {
  const useStateCalls = node
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((c) => c.getExpression().getText() === "useState");

  for (const call of useStateCalls) {
    const parent = call.getParent();
    if (!parent) continue;

    let declaration: VariableDeclaration | undefined;
    if (parent.getKind() === SyntaxKind.VariableDeclaration) {
      declaration = parent.asKind(SyntaxKind.VariableDeclaration);
    } else if (parent.getKind() === SyntaxKind.ArrayBindingPattern) {
      const bindingParent = parent.getParent();
      if (bindingParent?.getKind() === SyntaxKind.VariableDeclaration) {
        declaration = bindingParent.asKind(SyntaxKind.VariableDeclaration);
      }
    }

    if (!declaration) continue;

    const binding = declaration.getNameNode();
    if (binding.getKind() !== SyntaxKind.ArrayBindingPattern) continue;

    const elements = binding.asKind(SyntaxKind.ArrayBindingPattern)?.getElements() ?? [];
    if (elements.length < 2) continue;

    const setter = elements[1];
    if (setter.getKind() !== SyntaxKind.BindingElement) continue;
    const setterName = setter.asKind(SyntaxKind.BindingElement)?.getNameNode().getText();
    if (!setterName) continue;

    const references = node
      .getDescendants()
      .filter(
        (n): n is Node & { getText: () => string } =>
          n.getKind() === SyntaxKind.Identifier && n.getText() === setterName
      );

    // Exclude the declaration site itself.
    const usedElsewhere = references.some(
      (ref) => ref.getStartLineNumber() !== setter.getStartLineNumber()
    );

    if (!usedElsewhere) {
      issues.push({
        ruleId: "unused-state-setter",
        category: "logic",
        severity: "low",
        message: `State setter "${setterName}" is never used`,
        line: setter.getStartLineNumber(),
        column: setter.getStartLinePos(),
        advice: "Remove unused state or wire the setter to user interactions.",
      });
    }
  }
}

function checkBusinessLogicInJsx(
  node: ComponentNode,
  issues: Issue[]
): void {
  const expressions = node.getDescendantsOfKind(SyntaxKind.JsxExpression);
  for (const expr of expressions) {
    const inner = expr.getExpression();
    if (!inner) continue;

    if (containsBusinessLogic(inner)) {
      issues.push({
        ruleId: "business-logic-in-jsx",
        category: "logic",
        severity: "medium",
        message: "Business logic mixed inside JSX expression",
        line: expr.getStartLineNumber(),
        column: expr.getStartLinePos(),
        advice: "Move calculations, filtering, and mapping out of JSX markup.",
      });
    }
  }
}

function containsBusinessLogic(node: Node): boolean {
  const kind = node.getKind();

  // Simple variable, literal, or spread of props is fine.
  if (
    kind === SyntaxKind.Identifier ||
    kind === SyntaxKind.StringLiteral ||
    kind === SyntaxKind.NumericLiteral ||
    kind === SyntaxKind.TrueKeyword ||
    kind === SyntaxKind.FalseKeyword ||
    kind === SyntaxKind.NullKeyword ||
    kind === SyntaxKind.UndefinedKeyword ||
    kind === SyntaxKind.PropertyAccessExpression ||
    kind === SyntaxKind.ElementAccessExpression ||
    kind === SyntaxKind.SpreadElement
  ) {
    return false;
  }

  // Only nested ternaries count as business logic.
  if (kind === SyntaxKind.ConditionalExpression) {
    return (
      node.getDescendantsOfKind(SyntaxKind.ConditionalExpression).length > 0
    );
  }

  if (kind === SyntaxKind.CallExpression) {
    const call = node as CallExpression;
    // IIFEs are always business logic.
    const callee = call.getExpression();
    if (
      callee.getKind() === SyntaxKind.ArrowFunction ||
      callee.getKind() === SyntaxKind.FunctionExpression
    ) {
      return true;
    }
    // Simple .map calls for rendering lists are fine.
    if (isSimpleMapCall(call)) return false;
    // Other calls (filter/reduce/chains) are non-trivial computed values.
    return true;
  }

  // Switch statements inside JSX are business logic.
  if (kind === SyntaxKind.SwitchStatement) return true;

  // Non-trivial computed values.
  if (
    kind === SyntaxKind.BinaryExpression ||
    kind === SyntaxKind.PrefixUnaryExpression ||
    kind === SyntaxKind.PostfixUnaryExpression ||
    kind === SyntaxKind.ArrowFunction ||
    kind === SyntaxKind.FunctionExpression
  ) {
    return true;
  }

  // Recurse into template expressions and parenthesized expressions.
  for (const child of node.getChildren()) {
    if (containsBusinessLogic(child)) return true;
  }

  return false;
}

function isSimpleMapCall(call: CallExpression): boolean {
  const expr = call.getExpression();
  if (expr.getKind() !== SyntaxKind.PropertyAccessExpression) return false;
  const propAccess = expr as PropertyAccessExpression;
  if (propAccess.getName() !== "map") return false;
  const args = call.getArguments();
  if (args.length !== 1) return false;
  const arg = args[0];
  return (
    arg.getKind() === SyntaxKind.ArrowFunction ||
    arg.getKind() === SyntaxKind.FunctionExpression
  );
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

function checkPropToStateSync(
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

    const stateElement = elements[0];
    const setterElement = elements[1];
    if (
      stateElement.getKind() !== SyntaxKind.BindingElement ||
      setterElement.getKind() !== SyntaxKind.BindingElement
    ) {
      continue;
    }

    const setterName = setterElement.asKind(SyntaxKind.BindingElement)?.getNameNode().getText();
    if (!setterName) continue;

    const initialArg = call.getArguments()[0];
    if (!initialArg) continue;

    const syncedSources = collectSyncedSources(initialArg, setterName, node);
    if (syncedSources.length === 0) continue;

    for (const source of syncedSources) {
      issues.push({
        ruleId: "prop-to-state-sync",
        category: "logic",
        severity: "high",
        message: `State synced from prop "${source}" via useEffect`,
        line: call.getStartLineNumber(),
        column: call.getStartLinePos(),
        advice: "Derive the value directly from props instead of syncing state.",
      });
    }
  }
}

function collectSyncedSources(
  initialArg: Node,
  setterName: string,
  node: ComponentNode
): string[] {
  const sources: string[] = [];
  const initialText = initialArg.getText();

  const effects = node
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((c) => c.getExpression().getText() === "useEffect");

  for (const effect of effects) {
    const args = effect.getArguments();
    if (args.length < 2) continue;
    const callback = args[0];
    const deps = args[1];
    if (!callback || !deps) continue;

    if (deps.getKind() !== SyntaxKind.ArrayLiteralExpression) continue;
    const depTexts = deps
      .asKind(SyntaxKind.ArrayLiteralExpression)
      ?.getElements()
      .map((e) => e.getText()) ?? [];

    const callbackBody =
      callback.getKind() === SyntaxKind.ArrowFunction
        ? callback.asKind(SyntaxKind.ArrowFunction)?.getBody()
        : callback.getKind() === SyntaxKind.FunctionExpression
          ? callback.asKind(SyntaxKind.FunctionExpression)?.getBody()
          : undefined;

    if (!callbackBody) continue;

    const statements =
      callbackBody.getKind() === SyntaxKind.Block
        ? callbackBody.asKind(SyntaxKind.Block)?.getStatements() ?? [callbackBody]
        : [callbackBody];

    for (const statement of statements) {
      const text = statement.getText();
      const setterCall = new RegExp(
        `${escapeRegex(setterName)}\\s*\\(\\s*([^\\)]+)\\s*\\)`
      ).exec(text);
      if (!setterCall) continue;

      const syncedValue = setterCall[1].trim();
      if (depTexts.includes(syncedValue) && syncedValue === initialText) {
        sources.push(syncedValue);
      }
    }
  }

  return sources;
}

function escapeRegex(value: string): string {
  return value.replace(/[\\.+*?^$|()[\]]/g, "\\$&");
}

function checkZombieState(
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
    if (elements.length < 1) continue;

    const stateElement = elements[0];
    if (stateElement.getKind() !== SyntaxKind.BindingElement) continue;
    const stateName = stateElement.asKind(SyntaxKind.BindingElement)?.getNameNode().getText();
    if (!stateName) continue;

    const references = node
      .getDescendants()
      .filter(
        (n): n is Node & { getText: () => string } =>
          n.getKind() === SyntaxKind.Identifier && n.getText() === stateName
      );

    const usedElsewhere = references.some(
      (ref) => ref.getStartLineNumber() !== stateElement.getStartLineNumber()
    );

    if (!usedElsewhere) {
      issues.push({
        ruleId: "zombie-state",
        category: "logic",
        severity: "high",
        message: `State "${stateName}" is declared but never read`,
        line: stateElement.getStartLineNumber(),
        column: stateElement.getStartLinePos(),
        advice: "Remove unused state or read it in render or effects.",
      });
    }
  }
}

function checkPointlessMemo(
  node: ComponentNode,
  issues: Issue[]
): void {
  const memos = node
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((c) => ["useMemo", "useCallback"].includes(c.getExpression().getText()));

  for (const memo of memos) {
    const factory = memo.getArguments()[0];
    if (!factory) continue;

    if (factory.getKind() === SyntaxKind.ArrowFunction) {
      const fn = factory.asKind(SyntaxKind.ArrowFunction);
      if (fn && isPointlessMemoBody(fn.getBody())) {
        issues.push({
          ruleId: "pointless-memo",
          category: "logic",
          severity: "low",
          message: "useMemo/useCallback wraps a trivial value or identity function",
          line: memo.getStartLineNumber(),
          column: memo.getStartLinePos(),
          advice: "Remove the memoization unless the value is expensive or referentially sensitive.",
        });
      }
      continue;
    }

    if (factory.getKind() === SyntaxKind.FunctionExpression) {
      const fn = factory.asKind(SyntaxKind.FunctionExpression);
      if (fn && isPointlessMemoBody(fn.getBody())) {
        issues.push({
          ruleId: "pointless-memo",
          category: "logic",
          severity: "low",
          message: "useMemo/useCallback wraps a trivial value or identity function",
          line: memo.getStartLineNumber(),
          column: memo.getStartLinePos(),
          advice: "Remove the memoization unless the value is expensive or referentially sensitive.",
        });
      }
    }
  }
}

function isPointlessMemoBody(body: Node | undefined): boolean {
  if (!body) return false;

  const kind = body.getKind();
  if (
    kind === SyntaxKind.StringLiteral ||
    kind === SyntaxKind.NumericLiteral ||
    kind === SyntaxKind.TrueKeyword ||
    kind === SyntaxKind.FalseKeyword ||
    kind === SyntaxKind.NullKeyword ||
    kind === SyntaxKind.UndefinedKeyword
  ) {
    return true;
  }

  // Expression-bodied arrow returning its only parameter (identity function).
  if (kind === SyntaxKind.Identifier) {
    return true;
  }

  if (kind === SyntaxKind.Block) {
    const statements = body.asKind(SyntaxKind.Block)?.getStatements() ?? [];
    if (statements.length !== 1) return false;
    const statement = statements[0];
    if (statement.getKind() === SyntaxKind.ReturnStatement) {
      const expr = statement.asKind(SyntaxKind.ReturnStatement)?.getExpression();
      return expr ? isPointlessMemoBody(expr) : false;
    }
  }

  return false;
}

function checkHandRolledUtility(
  node: ComponentNode,
  issues: Issue[]
): void {
  const nestedFunctions = [
    ...node.getDescendantsOfKind(SyntaxKind.FunctionDeclaration),
    ...node.getDescendantsOfKind(SyntaxKind.FunctionExpression),
    ...node.getDescendantsOfKind(SyntaxKind.ArrowFunction),
  ].filter((fn) => fn !== node && !isInsideJsxAttribute(fn));

  for (const fn of nestedFunctions) {
    const text = fn.getText();
    const name = getFunctionName(fn);
    const looksLikeUtility =
      UTILITY_FUNCTION_NAMES.some((p) => name.toLowerCase().includes(p.toLowerCase())) ||
      UTILITY_PATTERNS.some((p) => p.test(text));

    if (!looksLikeUtility) continue;

    issues.push({
      ruleId: "hand-rolled-utility",
      category: "logic",
      severity: "medium",
      message: `Utility-like function "${name || "anonymous"}" defined inside a component`,
      line: fn.getStartLineNumber(),
      column: fn.getStartLinePos(),
      advice: "Move sorting, formatting, and string utilities into a shared module or library.",
    });
  }
}

function isInsideJsxAttribute(fn: ArrowFunction | FunctionExpression | FunctionDeclaration): boolean {
  let current: Node | undefined = fn.getParent();
  while (current) {
    if (current.getKind() === SyntaxKind.JsxAttribute) return true;
    current = current.getParent();
  }
  return false;
}

function getFunctionName(
  fn: ArrowFunction | FunctionExpression | FunctionDeclaration
): string {
  if (fn.getKind() === SyntaxKind.FunctionDeclaration) {
    return fn.asKind(SyntaxKind.FunctionDeclaration)?.getName() ?? "";
  }
  const parent = fn.getParent();
  if (parent?.getKind() === SyntaxKind.VariableDeclaration) {
    return parent.asKind(SyntaxKind.VariableDeclaration)?.getName() ?? "";
  }
  return "";
}

const UTILITY_FUNCTION_NAMES = [
  "sort",
  "format",
  "formatDate",
  "formatNumber",
  "capitalize",
  "camelCase",
  "kebabCase",
  "snakeCase",
  "truncate",
  "groupBy",
  "orderBy",
  "debounce",
  "throttle",
];

const UTILITY_PATTERNS = [
  /\.sort\s*\(/,
  /\.toLocaleDateString\s*\(/,
  /\.toLocaleString\s*\(/,
  /\.toFixed\s*\(/,
  /\.padStart\s*\(/,
  /\.padEnd\s*\(/,
  /\.replace\s*\(/,
  /\.split\s*\(/,
  /\.join\s*\(/,
  /new\s+Date\s*\(/,
  /Date\.now\s*\(/,
];
