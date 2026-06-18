import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { styleSheetAvoidanceRule } from '../../src/rules/logic/style-sheet-avoidance';
import type { Issue, ResolvedConfig, RuleContext } from '../../src/types';

function makeConfig(overrides?: Partial<ResolvedConfig>): ResolvedConfig {
  return {
    include: [],
    exclude: [],
    rules: {},
    frameworkMultipliers: {},
    ruleConfig: {},
    contextTaxCaps: { cleanCap: 0, standardCap: 0 },
    arbitraryValueAllowlist: [],
    wcag: { targetSizeExemptSelectors: [] },
    thresholds: {
      meanSlop: 0,
      p90Slop: 0,
      individualSlopThreshold: 0,
    },
    ...overrides,
  };
}

async function runRule(source: string, config: ResolvedConfig): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slop-audit-style-sheet-avoidance-test-'));
  try {
    const filePath = join(dir, 'Component.tsx');
    writeFileSync(filePath, source);
    const { ast, nodeCount } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, nodeCount);
    const context: RuleContext = { config, filePath, cwd: dir };
    const ruleContext = styleSheetAvoidanceRule.create(context);
    return styleSheetAvoidanceRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('logic/style-sheet-avoidance', () => {
  it('flags React Native file with inline styles and no StyleSheet import', async () => {
    const source = `
import { View, Text } from 'react-native';

export function MyComponent() {
  return (
    <View style={{ flex: 1, backgroundColor: 'white' }}>
      <Text style={{ fontSize: 16 }}>Hello</Text>
    </View>
  );
}
`;
    const issues = await runRule(source, makeConfig({ framework: 'react-native' }));
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('logic/style-sheet-avoidance');
    expect(issues[0].message).toBe('React Native file has 2 style prop(s) without StyleSheet');
    expect(issues[0].advice).toBe('Use StyleSheet.create for static styles.');
  });

  it('does not flag React Native file importing StyleSheet', async () => {
    const source = `
import { View, Text, StyleSheet } from 'react-native';

export function MyComponent() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Hello</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  text: { fontSize: 16 },
});
`;
    const issues = await runRule(source, makeConfig({ framework: 'react-native' }));
    expect(issues).toHaveLength(0);
  });

  it('does not flag web file with inline styles', async () => {
    const source = `
export function MyComponent() {
  return <div style={{ color: 'red' }}>Hello</div>;
}
`;
    const issues = await runRule(source, makeConfig({ framework: 'react' }));
    expect(issues).toHaveLength(0);
  });

  it('does not flag React Native file without inline styles', async () => {
    const source = `
import { View, Text } from 'react-native';

export function MyComponent() {
  return <View><Text>Hello</Text></View>;
}
`;
    const issues = await runRule(source, makeConfig({ framework: 'react-native' }));
    expect(issues).toHaveLength(0);
  });
});
