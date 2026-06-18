import { describe, expect, it } from 'vitest';
import { formatPretty } from '../../src/report/pretty.js';
import type { ProjectReport } from '../../src/types.js';

function makeReport(overrides: Partial<ProjectReport> = {}): ProjectReport {
  return {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    configPath: 'slop-audit.config.js',
    slopIndex: 34.2,
    assemblyHealth: 65.8,
    categoryScores: {
      visual: 12.5,
      typo: 8.0,
      wcag: 15.2,
      layout: 3.1,
      component: 9.9,
      logic: 21.4,
      arch: 4.2,
      perf: 0,
    },
    p90Score: 88.0,
    peakScore: 92.0,
    componentCount: 25,
    fileCount: 12,
    components: [
      {
        filePath: 'src/pages/Home.tsx',
        rawScore: 12.0,
        componentScore: 8.0,
        adjustedScore: 30.0,
        componentCount: 1,
      },
      {
        filePath: 'src/components/Button.tsx',
        rawScore: 4.0,
        componentScore: 3.0,
        adjustedScore: 12.0,
        componentCount: 1,
      },
    ],
    issues: [
      {
        ruleId: 'magic-spacing',
        category: 'layout',
        severity: 'medium',
        aiSpecific: false,
        filePath: 'src/components/Card.tsx',
        message: 'Avoid magic spacing values in layout',
        line: 14,
        column: 22,
        advice: 'Replace with a spacing token from the design system.',
      },
      {
        ruleId: 'zombie-state',
        category: 'logic',
        severity: 'high',
        aiSpecific: true,
        filePath: 'src/pages/Home.tsx',
        message: 'Unused state setter detected',
        line: 42,
        column: 10,
      },
    ],
    thresholds: { meanSlop: 25, p90Slop: 50, individualSlopThreshold: 50 },
    ...overrides,
  };
}

describe('formatPretty', () => {
  it('prints a scan summary', () => {
    const output = formatPretty(makeReport());
    expect(output).toContain(
      'Scanned 12 files, 25 components, 2 issues (high: 1, medium: 1, low: 0)',
    );
  });

  it('falls back to 0 files when fileCount is omitted', () => {
    const output = formatPretty(makeReport({ fileCount: undefined }));
    expect(output).toContain('Scanned 0 files,');
  });

  it('prints a zero-issue summary with pluralized nouns', () => {
    const output = formatPretty(makeReport({ issues: [], componentCount: 1, fileCount: 1 }));
    expect(output).toContain(
      'Scanned 1 file, 1 component, 0 issues (high: 0, medium: 0, low: 0)',
    );
  });

  it('includes score line and legend', () => {
    const output = formatPretty(makeReport());
    expect(output).toContain('Slop Index: 34  |  Health: 66');
    expect(output).toContain(
      '(lower Slop Index is better; Health is the inverse)',
    );
  });

  it('warns about micro-repos', () => {
    const output = formatPretty(makeReport({ componentCount: 8 }));

    expect(output).toContain('Small project detected (<=10 components)');
    expect(output).toContain('Scores are not normalized');
  });

  it('does not warn for larger repos', () => {
    const output = formatPretty(makeReport());

    expect(output).not.toContain('Small project detected');
  });

  it('shows category breakdown rows sorted by score', () => {
    const output = formatPretty(makeReport());

    expect(output).toContain('Visual');
    expect(output).toContain('Logic');
    expect(output).toContain('12.5');
    expect(output).toContain('21.4');
  });

  it('lists top offending components sorted by adjusted score', () => {
    const output = formatPretty(makeReport());

    expect(output).toContain('Top offending components');
    expect(output).toContain('src/pages/Home.tsx');
    expect(output).toContain('30.0');
    expect(output.indexOf('src/pages/Home.tsx')).toBeLessThan(
      output.indexOf('src/components/Button.tsx'),
    );
  });

  it('renders per-issue details and advice', () => {
    const output = formatPretty(makeReport());

    expect(output).toContain('magic-spacing');
    expect(output).toContain('zombie-state');
    expect(output).toContain('src/components/Card.tsx:14:22');
    expect(output).toContain('src/pages/Home.tsx:42:10');
    expect(output).toContain('Avoid magic spacing values in layout');
    expect(output).toContain('Replace with a spacing token from the design system.');
  });

  it('formats parse errors concisely with a tip', () => {
    const report = makeReport({
      parseErrors: [{ filePath: '/project/bad.tsx', error: 'Unexpected token\n  at line 5' }],
    });
    const output = formatPretty(report);

    expect(output).toContain('Parse errors (1) — these files were skipped:');
    expect(output).toContain('/project/bad.tsx: Unexpected token');
    expect(output).not.toContain('at line 5');
    expect(output).toContain('Tip: add a path to `exclude`');
  });

  it('truncates multi-line parse errors to the first line', () => {
    const report = makeReport({
      parseErrors: [{ filePath: 'src/deep.tsx', error: 'SyntaxError: invalid syntax\n  at Parser.parse\n  at Object.transform' }],
    });
    const output = formatPretty(report);

    expect(output).toContain('src/deep.tsx: SyntaxError: invalid syntax');
    expect(output).not.toContain('Parser.parse');
    expect(output).not.toContain('Object.transform');
  });

  it('prints threshold status with plain labels', () => {
    const output = formatPretty(makeReport({
      slopIndex: 31.1,
      p90Score: 100,
      peakScore: 100,
      thresholds: { meanSlop: 25, p90Slop: 50, individualSlopThreshold: 50 },
    }));
    const thresholdLine = (label: string, value: number, limit: number) =>
      `  ${label.padEnd(30, ' ')}${`${value.toFixed(1)} / ${limit}`.padStart(12, ' ')}  fail`;

    expect(output).toContain(thresholdLine('Project average', 31.1, 25));
    expect(output).toContain(thresholdLine('Worst 10% of files', 100, 50));
    expect(output).toContain(thresholdLine('Highest single file', 100, 50));
    expect(output).toContain('Next step: run `slop-audit scan --suggest`');
  });

  it('prints all-passed message when thresholds pass', () => {
    const output = formatPretty(makeReport({
      slopIndex: 10,
      p90Score: 20,
      peakScore: 30,
      thresholds: { meanSlop: 25, p90Slop: 50, individualSlopThreshold: 50 },
    }));
    expect(output).toContain('All thresholds passed.');
  });
});
