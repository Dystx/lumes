import { readFileSync } from 'fs';
import type { Module } from '@swc/core';
import type {
  ScanFacts,
  ComponentFacts,
  ClassNameFact,
  ElementFact,
  HookFact,
  LogicalExpressionFact,
} from '../types';

type AnyNode = unknown;

interface ComponentFrame extends ComponentFacts {
  isComponent: boolean;
}

interface WalkContext {
  stack: ComponentFrame[];
  useClient: boolean;
}

function isObject(node: AnyNode): node is Record<string, unknown> {
  return typeof node === 'object' && node !== null && !Array.isArray(node);
}

function isHookName(name: string): boolean {
  return name.startsWith('use') && name.length > 3 && name[3] === name[3].toUpperCase();
}

function getNodeType(node: AnyNode): string | undefined {
  if (isObject(node) && typeof node.type === 'string') {
    return node.type;
  }
  return undefined;
}

function spanStart(node: AnyNode): number | undefined {
  if (isObject(node) && isObject(node.span) && typeof node.span.start === 'number') {
    return node.span.start as number;
  }
  return undefined;
}

function buildLineOffsets(source: string): number[] {
  const offsets: number[] = [0];
  let byteOffset = 0;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '\n') {
      byteOffset += Buffer.byteLength(char, 'utf-8');
      offsets.push(byteOffset);
    } else if (char === '\r') {
      byteOffset += Buffer.byteLength(char, 'utf-8');
      if (i + 1 < source.length && source[i + 1] === '\n') {
        byteOffset += Buffer.byteLength('\n', 'utf-8');
        i++;
      }
      offsets.push(byteOffset);
    } else {
      byteOffset += Buffer.byteLength(char, 'utf-8');
    }
  }
  return offsets;
}

function positionFromOffset(offset: number, lineOffsets: number[]): { line: number; column: number } {
  // SWC spans are 1-based byte offsets; convert to 0-based.
  const byteOffset = Math.max(0, offset - 1);

  let low = 1;
  let high = lineOffsets.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (lineOffsets[mid] <= byteOffset) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  const line = low;
  const column = byteOffset - lineOffsets[line - 1] + 1;
  return { line, column };
}

function positionFrom(node: AnyNode, lineOffsets: number[]): { line: number; column: number } {
  const start = spanStart(node);
  if (start === undefined) return { line: 1, column: 1 };
  return positionFromOffset(start, lineOffsets);
}

function containsJsx(node: AnyNode): boolean {
  if (!isObject(node)) return false;
  const type = getNodeType(node);
  if (type === 'JSXElement' || type === 'JSXFragment') return true;
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (containsJsx(item)) return true;
      }
    } else if (isObject(value)) {
      if (containsJsx(value)) return true;
    }
  }
  return false;
}

function stringLiteralValue(node: AnyNode): string | undefined {
  if (isObject(node) && node.type === 'StringLiteral' && typeof node.value === 'string') {
    return node.value as string;
  }
  return undefined;
}

function templateLiteralValue(node: AnyNode): string | undefined {
  if (!isObject(node) || node.type !== 'TemplateLiteral') return undefined;
  const exprs = node.expressions;
  if (Array.isArray(exprs) && exprs.length === 0) {
    const quasis = node.quasis;
    if (Array.isArray(quasis) && quasis.length > 0 && isObject(quasis[0]) && typeof quasis[0].raw === 'string') {
      const cooked = quasis[0].cooked;
      return (typeof cooked === 'string' ? cooked : (quasis[0].raw as string));
    }
  }
  return undefined;
}

function staticClassValue(node: AnyNode): string | undefined {
  return stringLiteralValue(node) ?? templateLiteralValue(node);
}

function jsxAttrName(node: AnyNode): string | undefined {
  if (!isObject(node) || node.type !== 'JSXAttribute') return undefined;
  const name = node.name;
  if (isObject(name) && typeof name.value === 'string') {
    return name.value as string;
  }
  if (isObject(name) && typeof (name as Record<string, unknown>).name === 'string') {
    return (name as Record<string, unknown>).name as string;
  }
  return undefined;
}

function jsxElementName(node: AnyNode): string | undefined {
  if (!isObject(node)) return undefined;
  if (node.type === 'JSXOpeningElement' || node.type === 'JSXClosingElement') {
    const name = node.name;
    if (isObject(name) && typeof name.value === 'string') {
      return name.value as string;
    }
  }
  if (node.type === 'JSXElement') {
    return jsxElementName(node.opening);
  }
  return undefined;
}

function unwrapJsxExpression(node: AnyNode): AnyNode {
  if (isObject(node) && node.type === 'JSXExpressionContainer') {
    return node.expression as AnyNode;
  }
  return node;
}

function getFunctionName(node: Record<string, unknown>): string | undefined {
  if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') {
    const id = node.identifier as AnyNode;
    if (isObject(id) && typeof id.value === 'string') {
      return id.value as string;
    }
  }
  return undefined;
}

function binaryAndDepth(node: AnyNode): number {
  if (!isObject(node) || node.type !== 'BinaryExpression' || node.operator !== '&&') {
    return 0;
  }
  const left = node.left as AnyNode;
  const right = node.right as AnyNode;
  return 1 + Math.max(binaryAndDepth(left), binaryAndDepth(right));
}

function collectChainText(node: AnyNode): string {
  if (!isObject(node) || node.type !== 'BinaryExpression' || node.operator !== '&&') {
    if (isObject(node) && typeof node.value === 'string') return node.value as string;
    if (isObject(node) && typeof node.name === 'string') return node.name as string;
    return 'expr';
  }
  const left = node.left as AnyNode;
  const right = node.right as AnyNode;
  const leftText = collectChainText(left);
  const rightText = collectChainText(right);
  return `${leftText} && ${rightText}`;
}

export function extractFacts(filePath: string, ast: Module, nodeCount: number): ScanFacts {
  const source = readFileSync(filePath, 'utf-8');
  const lineOffsets = buildLineOffsets(source);

  const facts: ScanFacts = {
    filePath,
    astNodeCount: nodeCount,
    components: [],
    staticClassNames: [],
    interactiveElements: [],
    hooks: [],
    logicalExpressions: [],
  };

  const ctx: WalkContext = {
    stack: [],
    useClient: false,
  };

  function nearestComponent(): ComponentFrame | null {
    for (let i = ctx.stack.length - 1; i >= 0; i--) {
      if (ctx.stack[i].isComponent) {
        return ctx.stack[i];
      }
    }
    return null;
  }

  function attachHook(hook: HookFact): void {
    facts.hooks.push(hook);
    const component = nearestComponent();
    if (component) {
      component.hookCalls.push(hook);
    }
  }

  function pushFrame(node: Record<string, unknown>): void {
    const name = getFunctionName(node);
    const { line, column } = positionFrom(node, lineOffsets);
    ctx.stack.push({
      name,
      line,
      column,
      isServerComponent: !ctx.useClient,
      hookCalls: [],
      isComponent: containsJsx(node),
    });
  }

  function popFrame(): void {
    const frame = ctx.stack.pop();
    if (frame && frame.isComponent) {
      const { isComponent, ...component } = frame;
      facts.components.push(component);
    }
  }

  function isAndChainChild(parent: AnyNode): boolean {
    return isObject(parent) && parent.type === 'BinaryExpression' && parent.operator === '&&';
  }

  function processNode(node: AnyNode, parent: AnyNode): void {
    if (!isObject(node)) return;

    const type = getNodeType(node);

    // Detect "use client" directive at the top of the module.
    if (type === 'ExpressionStatement') {
      const expr = node.expression as AnyNode;
      if (isObject(expr) && expr.type === 'StringLiteral' && expr.value === 'use client') {
        ctx.useClient = true;
      }
    }

    // Detect hook calls and attach to the nearest enclosing component frame.
    if (type === 'CallExpression') {
      const callee = node.callee as AnyNode;
      if (isObject(callee) && callee.type === 'Identifier' && typeof callee.value === 'string' && isHookName(callee.value)) {
        const { line, column } = positionFrom(node, lineOffsets);
        attachHook({ name: callee.value as string, line, column });
      }
    }

    // Detect static className / class JSX attributes.
    if (type === 'JSXAttribute') {
      const attrName = jsxAttrName(node);
      if (attrName === 'className' || attrName === 'class') {
        const raw = node.value as AnyNode;
        const valueNode = unwrapJsxExpression(raw);
        const classValue = staticClassValue(valueNode);
        if (classValue !== undefined) {
          const { line, column } = positionFrom(node, lineOffsets);
          facts.staticClassNames.push({ value: classValue, line, column });
        }
      }
    }

    // Detect interactive elements.
    if (type === 'JSXOpeningElement') {
      const tag = jsxElementName(node);
      if (tag === 'button' || tag === 'a' || tag === 'input') {
        const attributes: Record<string, string | undefined> = {};
        const classNames: ClassNameFact[] = [];
        const attrs = node.attributes as AnyNode[];
        for (const attr of attrs) {
          if (!isObject(attr) || attr.type !== 'JSXAttribute') continue;
          const name = jsxAttrName(attr);
          if (!name) continue;
          const raw = attr.value as AnyNode;
          const valueNode = unwrapJsxExpression(raw);
          const staticValue = stringLiteralValue(valueNode);
          attributes[name] = staticValue;
          if (name === 'className' || name === 'class') {
            const classValue = staticClassValue(valueNode);
            if (classValue !== undefined) {
              const { line, column } = positionFrom(attr, lineOffsets);
              classNames.push({ value: classValue, line, column });
            }
          }
        }
        const { line, column } = positionFrom(node, lineOffsets);
        facts.interactiveElements.push({ tag: tag as string, attributes, classNames, line, column });
      }
    }

    // Detect deep && binary expression chains.
    if (type === 'BinaryExpression' && node.operator === '&&' && !isAndChainChild(parent)) {
      const depth = binaryAndDepth(node);
      if (depth >= 3) {
        const { line, column } = positionFrom(node, lineOffsets);
        facts.logicalExpressions.push({
          depth,
          line,
          column,
          text: collectChainText(node),
        });
      }
    }
  }

  function visit(node: AnyNode, parent: AnyNode = null): void {
    if (!isObject(node)) return;

    const type = getNodeType(node);
    const isFunction = type === 'FunctionDeclaration' || type === 'FunctionExpression' || type === 'ArrowFunctionExpression';

    if (isFunction) {
      pushFrame(node);
    }

    processNode(node, parent);

    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          visit(item, node);
        }
      } else if (isObject(value)) {
        visit(value, node);
      }
    }

    if (isFunction) {
      popFrame();
    }
  }

  visit(ast);

  return facts;
}
