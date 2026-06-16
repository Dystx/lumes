import { describe, expect, it } from 'vitest';
import { formatSarif } from '../../src/report/sarif.js';
import type { Issue, ProjectReport } from '../../src/types.js';

function makeReport(issues: Issue[] = []): ProjectReport {
  return {
    version: '1.0.0',
    generatedAt: '2026-06-15T00:00:00.000Z',
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
    componentCount: 12,
    components: [],
    issues,
  };
}

function makeIssue(overrides: Partial<Issue> & Pick<Issue, 'ruleId' | 'filePath'>): Issue {
  return {
    category: 'visual',
    severity: 'medium',
    aiSpecific: true,
    message: 'Sample issue message',
    line: 1,
    column: 1,
    ...overrides,
  };
}

describe('formatSarif', () => {
  it('returns valid JSON with the correct SARIF version and tool metadata', () => {
    const report = makeReport();
    const output = formatSarif(report);

    expect(() => JSON.parse(output)).not.toThrow();

    const parsed = JSON.parse(output) as {
      $schema: string;
      version: string;
      runs: Array<{
        tool: { driver: { name: string; version: string; rules: unknown[] } };
        results: unknown[];
      }>;
    };

    expect(parsed.$schema).toBe('https://json.schemastore.org/sarif-2.1.0.json');
    expect(parsed.version).toBe('2.1.0');
    expect(parsed.runs).toHaveLength(1);
    expect(parsed.runs[0].tool.driver.name).toBe('slop-audit');
    expect(parsed.runs[0].tool.driver.version).toBe('1.0.0');
    expect(parsed.runs[0].results).toHaveLength(0);
    expect(parsed.runs[0].tool.driver.rules).toHaveLength(0);
  });

  it('derives rules from unique issue ruleIds with property metadata', () => {
    const issues: Issue[] = [
      makeIssue({
        ruleId: 'rule-a',
        category: 'wcag',
        severity: 'high',
        aiSpecific: false,
        message: 'First issue',
        filePath: '/workspace/src/a.tsx',
        line: 10,
        column: 5,
      }),
      makeIssue({
        ruleId: 'rule-b',
        category: 'logic',
        severity: 'low',
        aiSpecific: true,
        message: 'Second issue',
        filePath: '/workspace/src/b.tsx',
        line: 20,
        column: 8,
      }),
      makeIssue({
        ruleId: 'rule-a',
        category: 'wcag',
        severity: 'high',
        aiSpecific: false,
        message: 'Duplicate rule issue',
        filePath: '/workspace/src/c.tsx',
        line: 30,
        column: 12,
      }),
    ];

    const output = formatSarif(makeReport(issues));
    const parsed = JSON.parse(output) as {
      runs: Array<{
        tool: {
          driver: {
            rules: Array<{
              id: string;
              name: string;
              shortDescription: { text: string };
              properties: {
                aiSpecific: boolean;
                category: string;
                severity: string;
              };
            }>;
          };
        };
        results: Array<{
          ruleId: string;
          message: { text: string };
          locations: Array<{
            physicalLocation: {
              artifactLocation: { uri: string };
              region: { startLine: number; startColumn: number };
            };
          }>;
        }>;
      }>;
    };

    const rules = parsed.runs[0].tool.driver.rules;
    expect(rules).toHaveLength(2);
    expect(rules.map((r) => r.id)).toEqual(['rule-a', 'rule-b']);

    const ruleA = rules.find((r) => r.id === 'rule-a');
    expect(ruleA).toBeDefined();
    expect(ruleA?.name).toBe('rule-a');
    expect(ruleA?.shortDescription.text).toBe('rule-a');
    expect(ruleA?.properties).toEqual({
      aiSpecific: false,
      category: 'wcag',
      severity: 'high',
    });

    expect(parsed.runs[0].results).toHaveLength(3);
    const resultB = parsed.runs[0].results.find((r) => r.ruleId === 'rule-b');
    expect(resultB?.message.text).toBe('Second issue');
    expect(resultB?.locations[0].physicalLocation.region).toEqual({
      startLine: 20,
      startColumn: 8,
    });
  });

  it('computes relative artifact URIs when cwd is provided', () => {
    const issues: Issue[] = [
      makeIssue({
        ruleId: 'rule-c',
        filePath: '/workspace/src/deep/nested/file.tsx',
        line: 42,
        column: 3,
      }),
    ];

    const output = formatSarif(makeReport(issues), { cwd: '/workspace' });
    const parsed = JSON.parse(output) as {
      runs: Array<{
        results: Array<{
          locations: Array<{
            physicalLocation: {
              artifactLocation: { uri: string };
            };
          }>;
        }>;
      }>;
    };

    expect(parsed.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri).toBe(
      'src/deep/nested/file.tsx',
    );
  });

  it('falls back to basename for absolute paths when cwd is omitted', () => {
    const issues: Issue[] = [
      makeIssue({
        ruleId: 'rule-d',
        filePath: '/workspace/src/file.tsx',
        line: 1,
        column: 1,
      }),
    ];

    const output = formatSarif(makeReport(issues));
    const parsed = JSON.parse(output) as {
      runs: Array<{
        results: Array<{
          locations: Array<{
            physicalLocation: {
              artifactLocation: { uri: string };
            };
          }>;
        }>;
      }>;
    };

    expect(parsed.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri).toBe(
      'file.tsx',
    );
  });

  it('resolves a relative filePath against an absolute cwd', () => {
    const issues: Issue[] = [
      makeIssue({
        ruleId: 'rule-e',
        filePath: 'src/components/Button.tsx',
        line: 7,
        column: 4,
      }),
    ];

    const output = formatSarif(makeReport(issues), { cwd: '/workspace' });
    const parsed = JSON.parse(output) as {
      runs: Array<{
        results: Array<{
          locations: Array<{
            physicalLocation: {
              artifactLocation: { uri: string };
            };
          }>;
        }>;
      }>;
    };

    expect(parsed.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri).toBe(
      'src/components/Button.tsx',
    );
  });

  it('falls back to "." when filePath is undefined', () => {
    const issues: Issue[] = [
      makeIssue({
        ruleId: 'rule-f',
        filePath: undefined,
        line: 1,
        column: 1,
      }),
    ];

    const output = formatSarif(makeReport(issues));
    const parsed = JSON.parse(output) as {
      runs: Array<{
        results: Array<{
          locations: Array<{
            physicalLocation: {
              artifactLocation: { uri: string };
            };
          }>;
        }>;
      }>;
    };

    expect(parsed.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri).toBe('.');
  });

  it('preserves result ordering from the input issues', () => {
    const issues: Issue[] = [
      makeIssue({
        ruleId: 'first',
        filePath: '/workspace/a.tsx',
        line: 1,
        column: 1,
      }),
      makeIssue({
        ruleId: 'second',
        filePath: '/workspace/b.tsx',
        line: 2,
        column: 2,
      }),
      makeIssue({
        ruleId: 'third',
        filePath: '/workspace/c.tsx',
        line: 3,
        column: 3,
      }),
    ];

    const output = formatSarif(makeReport(issues));
    const parsed = JSON.parse(output) as {
      runs: Array<{
        results: Array<{ ruleId: string }>;
      }>;
    };

    expect(parsed.runs[0].results.map((r) => r.ruleId)).toEqual(['first', 'second', 'third']);
  });

  it('produces .. segments for filePaths outside cwd', () => {
    const issues: Issue[] = [
      makeIssue({
        ruleId: 'rule-g',
        filePath: '/other-project/src/outside.tsx',
        line: 5,
        column: 10,
      }),
    ];

    const output = formatSarif(makeReport(issues), { cwd: '/workspace' });
    const parsed = JSON.parse(output) as {
      runs: Array<{
        results: Array<{
          locations: Array<{
            physicalLocation: {
              artifactLocation: { uri: string };
            };
          }>;
        }>;
      }>;
    };

    expect(parsed.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri).toBe(
      '../other-project/src/outside.tsx',
    );
  });
});
