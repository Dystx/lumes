import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { parseSync } from '@swc/core';
import type { Module } from '@swc/core';

export interface ParseResult {
  ast: Module;
  nodeCount: number;
}

function syntaxFor(filePath: string): { syntax: 'typescript' | 'ecmascript'; jsx: boolean; tsx?: boolean } {
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (ext === 'ts' || ext === 'tsx') {
    return { syntax: 'typescript', jsx: false, tsx: ext === 'tsx' };
  }
  return { syntax: 'ecmascript', jsx: ext === 'jsx' };
}

function emptyModule(): Module {
  return parseSync('', { syntax: 'ecmascript', target: 'es2022' });
}

function countNodes(node: unknown): number {
  if (node === null || typeof node !== 'object') return 0;
  let count = 1;
  for (const value of Object.values(node as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        count += countNodes(item);
      }
    } else if (typeof value === 'object' && value !== null) {
      count += countNodes(value);
    }
  }
  return count;
}

function lineNumberOf(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) {
    const char = source[i];
    if (char === '\n') {
      line++;
    } else if (char === '\r') {
      if (i + 1 < source.length && source[i + 1] === '\n') {
        i++;
      }
      line++;
    }
  }
  return line;
}

interface ExtractedScript {
  openTag: string;
  content: string;
}

function extractScriptBlock(source: string): ExtractedScript | undefined {
  const match = source.match(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/i);
  if (!match || match.index === undefined) return undefined;

  const attrs = match[1] ?? '';
  const openTag = `<script${attrs}>`;
  const contentStartIndex = match.index + openTag.length;
  const contentStartLine = lineNumberOf(source, contentStartIndex);
  const rawContent = match[2];
  const leadingNewlines = '\n'.repeat(contentStartLine - 1);

  return {
    openTag,
    content: `${leadingNewlines}${rawContent}`,
  };
}

function isTypeScriptScript(openTag: string): boolean {
  return /\blang\s*=\s*["']?ts["']?/i.test(openTag);
}

function parseWithSwc(content: string, filePath: string): ParseResult {
  const { syntax, jsx, tsx } = syntaxFor(filePath);
  const ast = parseSync(content, {
    syntax,
    jsx,
    tsx,
    target: 'es2022',
  });
  return { ast, nodeCount: countNodes(ast) };
}

function parseAstro(source: string): ParseResult {
  // Astro templates are HTML-like, not valid TSX. Replace every non-newline
  // character with whitespace so line/column offsets are preserved, then parse
  // the blank file as a no-op module. The visitor performs Astro-specific
  // extraction from the original source text.
  const replaced = source.replace(/[^\r\n]/g, ' ');
  const ast = parseSync(replaced, {
    syntax: 'typescript',
    tsx: true,
    target: 'es2022',
  });
  return { ast, nodeCount: countNodes(ast) };
}

function parseScriptContent(content: string, isTypeScript: boolean): Module {
  if (isTypeScript) {
    return parseSync(content, {
      syntax: 'typescript',
      target: 'es2022',
    });
  }
  return parseSync(content, {
    syntax: 'ecmascript',
    jsx: false,
    target: 'es2022',
  });
}

function parseVue(source: string): ParseResult {
  const script = extractScriptBlock(source);
  if (!script) {
    const ast = emptyModule();
    return { ast, nodeCount: countNodes(ast) };
  }

  const ast = parseScriptContent(script.content, isTypeScriptScript(script.openTag));
  return { ast, nodeCount: countNodes(ast) };
}

function parseSvelte(source: string): ParseResult {
  const script = extractScriptBlock(source);
  if (!script) {
    const ast = emptyModule();
    return { ast, nodeCount: countNodes(ast) };
  }

  const ast = parseScriptContent(script.content, isTypeScriptScript(script.openTag));
  return { ast, nodeCount: countNodes(ast) };
}

function cacheEnabled(): boolean {
  return process.env.SLOP_AUDIT_CACHE === '1' || process.env.SLOP_AUDIT_CACHE === 'true';
}

function cacheRoot(): string {
  return join(process.cwd(), '.slop-audit', 'cache', 'ast');
}

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function cachePath(content: string): string {
  return join(cacheRoot(), `${hashContent(content)}.json`);
}

async function readCache(content: string): Promise<ParseResult | undefined> {
  const path = cachePath(content);
  try {
    await access(path);
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as ParseResult;
    if (parsed && typeof parsed.nodeCount === 'number' && parsed.ast) {
      return parsed;
    }
  } catch {
    // Cache miss or corruption; fall through to parse.
  }
  return undefined;
}

async function writeCache(content: string, result: ParseResult): Promise<void> {
  const path = cachePath(content);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(result), 'utf8');
}

function parseSource(source: string, filePath: string): ParseResult {
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'astro':
      return parseAstro(source);
    case 'vue':
      return parseVue(source);
    case 'svelte':
      return parseSvelte(source);
    default:
      try {
        return parseWithSwc(source, filePath);
      } catch (error) {
        // Many projects put JSX inside .js files (e.g. Next.js app router).
        // Retry once with JSX enabled before giving up.
        if (ext === 'js') {
          const ast = parseSync(source, {
            syntax: 'ecmascript',
            jsx: true,
            target: 'es2022',
          });
          return { ast, nodeCount: countNodes(ast) };
        }
        throw error;
      }
  }
}

export async function parseFile(filePath: string): Promise<ParseResult> {
  const source = await readFile(filePath, 'utf-8');

  if (cacheEnabled()) {
    const cached = await readCache(source);
    if (cached) return cached;
  }

  const result = parseSource(source, filePath);

  if (cacheEnabled()) {
    await writeCache(source, result);
  }

  return result;
}
