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
  it('includes header and legend', () => {
    const output = formatPretty(makeReport());

    expect(output).toContain('Slop Index: 34');
    expect(output).toContain('Assembly Health: 66');
    expect(output).toContain(
      '(0-100, higher = better, inverse of Slop Index)',
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

  it('lists parse errors when present', () => {
    const report = makeReport();
    report.parseErrors = [{ filePath: 'src/bad.tsx', error: 'Unexpected token' }];
    const output = formatPretty(report);

    expect(output).toContain('Parse errors (1)');
    expect(output).toContain('src/bad.tsx');
    expect(output).toContain('Unexpected token');
  });
});
