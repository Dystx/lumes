import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';

async function extract(fileName: string, source: string) {
  const dir = mkdtempSync(join(tmpdir(), 'slop-audit-template-class-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, nodeCount } = await parseFile(filePath);
    return extractFacts(filePath, ast, nodeCount);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('Vue template static class extraction', () => {
  it('extracts static class attributes and ignores dynamic :class', async () => {
    const source = `<template>
  <div class="flex gap-4">A</div>
  <div :class="dynamicClasses">B</div>
</template>
<script setup>
const dynamicClasses = 'text-red-500';
</script>`;
    const facts = await extract('Component.vue', source);
    expect(facts.staticClassNames).toHaveLength(1);
    expect(facts.staticClassNames[0].value).toBe('flex gap-4');
  });
});

describe('Svelte template static class extraction', () => {
  it('extracts static class attributes and ignores class: directives', async () => {
    const source = `<script>
  let active = false;
</script>
<div class="flex gap-4">A</div>
<div class:active={active}>B</div>`;
    const facts = await extract('Component.svelte', source);
    expect(facts.staticClassNames).toHaveLength(1);
    expect(facts.staticClassNames[0].value).toBe('flex gap-4');
  });
});

describe('Astro template static class extraction', () => {
  it('extracts static class attributes outside frontmatter', async () => {
    const source = `---
const dynamic = 'text-red-500';
---
<div class="flex gap-4">A</div>
<div class={dynamic}>B</div>`;
    const facts = await extract('Component.astro', source);
    expect(facts.staticClassNames.length).toBeGreaterThanOrEqual(1);
    expect(facts.staticClassNames.some((f) => f.value === 'flex gap-4')).toBe(true);
  });
});
