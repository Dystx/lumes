import type { Issue, Rule, ScanFacts } from '../../types';
import { createRule } from '../rule';

interface Context {
  filePath: string;
  framework?: string;
}

export const styleSheetAvoidanceRule = createRule<Context>({
  id: 'logic/style-sheet-avoidance',
  category: 'logic',
  severity: 'medium',
  aiSpecific: true,
  create(context) {
    return {
      filePath: context.filePath,
      framework: context.config.framework,
    };
  },
  analyze(context: Context, facts: ScanFacts): Issue[] {
    const framework = context.framework;
    if (framework !== 'react-native' && framework !== 'expo') {
      return [];
    }

    const styleProps = facts.styleProps ?? [];
    if (styleProps.length === 0) {
      return [];
    }

    const hasStyleSheetImport = facts.imports?.some(
      (imp) => imp.source === 'react-native' && imp.importedNames?.includes('StyleSheet'),
    );
    if (hasStyleSheetImport) {
      return [];
    }

    const firstStyleProp = styleProps[0];
    return [
      {
        ruleId: 'logic/style-sheet-avoidance',
        category: 'logic',
        severity: 'medium',
        aiSpecific: true,
        filePath: context.filePath,
        message: `React Native file has ${styleProps.length} style prop(s) without StyleSheet`,
        line: firstStyleProp.line,
        column: firstStyleProp.column,
        advice: 'Use StyleSheet.create for static styles.',
      },
    ];
  },
});

export default styleSheetAvoidanceRule satisfies Rule<Context>;
