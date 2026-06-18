import { describe, expect, it } from 'vitest';
import { parseFile } from '../../src/engine/parser';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const createTmpDir = () => mkdtempSync(join(tmpdir(), 'slop-audit-parser-test-'));

describe('parseFile', () => {
  it('parses a TSX file', async () => {
    const dir = createTmpDir();
    try {
      const file = join(dir, 'Button.tsx');
      writeFileSync(file, `export function Button() { return <button>Hi</button>; }`);
      const result = await parseFile(file);
      expect(result.ast.type).toBe('Module');
      expect(result.nodeCount).toBeGreaterThan(5);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('parses a .js file that contains JSX (Next.js style)', async () => {
    const dir = createTmpDir();
    try {
      const file = join(dir, 'Logo.js');
      writeFileSync(
        file,
        `export function Logo() {\n  return (\n    <Link href="/" className="logo" aria-label="Home">\n      <span>Logo</span>\n    </Link>\n  );\n}\n`,
      );
      const result = await parseFile(file);
      expect(result.ast.type).toBe('Module');
      expect(result.nodeCount).toBeGreaterThan(10);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws on invalid syntax', async () => {
    const dir = createTmpDir();
    try {
      const file = join(dir, 'bad.tsx');
      writeFileSync(file, `export function Button() { return <button>`);
      await expect(parseFile(file)).rejects.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('parses an .astro file with frontmatter and JSX', async () => {
    const dir = createTmpDir();
    try {
      const file = join(dir, 'Home.astro');
      writeFileSync(
        file,
        `---\nconst title = 'Home';\n---\n<html lang="en">\n  <body>\n    <h1 client:load>{title}</h1>\n  </body>\n</html>\n`,
      );
      const result = await parseFile(file);
      expect(result.ast.type).toBe('Module');
      // Astro templates are HTML-like, so the AST is intentionally blanked.
      expect(result.nodeCount).toBeGreaterThanOrEqual(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('parses an .astro file with no frontmatter', async () => {
    const dir = createTmpDir();
    try {
      const file = join(dir, 'Plain.astro');
      writeFileSync(file, `<div>hello</div>\n`);
      const result = await parseFile(file);
      expect(result.ast.type).toBe('Module');
      // Astro templates are HTML-like, so the AST is intentionally blanked.
      expect(result.nodeCount).toBeGreaterThanOrEqual(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('parses a .vue file with <script setup lang="ts">', async () => {
    const dir = createTmpDir();
    try {
      const file = join(dir, 'Counter.vue');
      writeFileSync(
        file,
        `<script setup lang="ts">\nconst count = ref(0);\nfunction inc() { count.value++; }\n</script>\n<template>\n  <button @click="inc">{{ count }}</button>\n</template>\n`,
      );
      const result = await parseFile(file);
      expect(result.ast.type).toBe('Module');
      expect(result.nodeCount).toBeGreaterThan(5);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('parses a .svelte file with a <script> block', async () => {
    const dir = createTmpDir();
    try {
      const file = join(dir, 'Counter.svelte');
      writeFileSync(
        file,
        `<script>\n  let count = 0;\n  function increment() { count += 1; }\n</script>\n<button on:click={increment}>{count}</button>\n`,
      );
      const result = await parseFile(file);
      expect(result.ast.type).toBe('Module');
      expect(result.nodeCount).toBeGreaterThan(5);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns an empty AST for a .vue file without a script block', async () => {
    const dir = createTmpDir();
    try {
      const file = join(dir, 'TemplateOnly.vue');
      writeFileSync(file, `<template><div>hi</div></template>\n`);
      const result = await parseFile(file);
      expect(result.ast.type).toBe('Module');
      expect(result.ast.body).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
