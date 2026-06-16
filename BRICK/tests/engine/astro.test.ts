import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';

async function extractAstroFacts(source: string): Promise<ReturnType<typeof extractFacts>> {
  const dir = mkdtempSync(join(tmpdir(), 'slop-audit-astro-test-'));
  try {
    const filePath = join(dir, 'Component.astro');
    writeFileSync(filePath, source);
    const { ast, nodeCount } = await parseFile(filePath);
    return extractFacts(filePath, ast, nodeCount);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('Astro extraction', () => {
  it('extracts interactive components without client directives', async () => {
    const source = `---
const count = 0;
---
<Counter onClick={() => count++} />`;
    const facts = await extractAstroFacts(source);
    expect(facts.astroComponents).toHaveLength(1);
    expect(facts.astroComponents[0]).toMatchObject({
      tag: 'Counter',
      hasClientDirective: false,
      hasEventHandler: true,
    });
  });

  it('detects client directives', async () => {
    const source = `<>
<Tabs client:load onChange={(v) => console.log(v)} />
<Static />
</>`;
    const facts = await extractAstroFacts(source);
    expect(facts.astroComponents).toHaveLength(2);
    const tabs = facts.astroComponents.find((c) => c.tag === 'Tabs');
    const staticComp = facts.astroComponents.find((c) => c.tag === 'Static');
    expect(tabs?.hasClientDirective).toBe(true);
    expect(staticComp?.hasEventHandler).toBe(false);
  });
});
