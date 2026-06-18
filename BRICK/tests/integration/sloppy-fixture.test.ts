import { describe, expect, it } from 'vitest';
import { resolve } from 'path';
import { scanFile } from '../../src/engine/worker';
import { DEFAULT_CONFIG } from '../../src/config';

describe('deliberately sloppy fixture', () => {
  it('catches the expected slop rules', async () => {
    const filePath = resolve(__dirname, '../fixtures/sloppy.tsx');
    const result = await scanFile(filePath, DEFAULT_CONFIG);

    expect(result.parseError).toBeUndefined();
    expect(result.componentCount).toBeGreaterThan(0);

    const ruleIds = [...new Set(result.issues.map((issue) => issue.ruleId))].sort();

    const expected = [
      'logic/boundary-violation',
      'logic/ghost-defensive',
      'logic/reactive-hook-soup',
      'logic/zombie-state',
      'perf/cls-image',
      'typo/calc-raw-px',
      'visual/arbitrary-escape',
      'visual/generic-centering',
      'wcag/focus-appearance',
    ];

    for (const ruleId of expected) {
      expect(ruleIds).toContain(ruleId);
    }
  });
});
