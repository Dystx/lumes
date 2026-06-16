import type { FixSuggestion, Issue, ProjectReport, ResolvedConfig } from '../types';
import { applyFocusRingFix } from './focus-ring';
import { applyLayoutTokenFix } from './layout-token';
import { applyUseClientFix } from './use-client';

export interface FixApplication {
  ruleId: string;
  description: string;
  kind: FixSuggestion['kind'];
}

export interface FixResult {
  filePath: string;
  applied: FixApplication[];
  skipped: FixApplication[];
  errors?: string[];
}

interface GroupedFixes {
  inserts: FixApplication[];
  replaces: FixSuggestion[];
  replaceApps: FixApplication[];
  cssAnchors: FixApplication[];
}

function collectAllFixes(issue: Issue): FixSuggestion[] {
  return [...(issue.fix ? [issue.fix] : []), ...(issue.fixes ?? [])];
}

export async function applyFixes(
  report: ProjectReport,
  config: ResolvedConfig,
): Promise<FixResult[]> {
  const byFile = new Map<string, GroupedFixes>();

  for (const issue of report.issues) {
    const fixes = collectAllFixes(issue);
    for (const fix of fixes) {
      if (!fix.targetFile) continue;

      const group: GroupedFixes = byFile.get(fix.targetFile) ?? {
        inserts: [],
        replaces: [],
        replaceApps: [],
        cssAnchors: [],
      };
      const app: FixApplication = {
        ruleId: issue.ruleId,
        description: fix.description,
        kind: fix.kind,
      };

      if (fix.kind === 'insert') {
        group.inserts.push(app);
      } else if (fix.kind === 'replace') {
        group.replaces.push(fix);
        group.replaceApps.push(app);
      } else if (fix.kind === 'css-anchor') {
        group.cssAnchors.push(app);
      }

      byFile.set(fix.targetFile, group);
    }
  }

  const results: FixResult[] = [];

  for (const [filePath, group] of byFile) {
    const applied: FixApplication[] = [];
    const skipped: FixApplication[] = [];
    const errors: string[] = [];

    if (group.inserts.length > 0) {
      try {
        const result = applyUseClientFix(filePath);
        if (result.applied) {
          applied.push(...group.inserts);
        } else {
          skipped.push(...group.inserts);
        }
      } catch (err) {
        errors.push(`use-client fix failed for ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (group.replaces.length > 0) {
      try {
        const result = applyLayoutTokenFix(filePath, group.replaces);
        const total = group.replaceApps.length;
        const appliedCount = Math.min(result.applied, total);
        const skippedCount = total - appliedCount;
        applied.push(...group.replaceApps.slice(0, appliedCount));
        skipped.push(...group.replaceApps.slice(appliedCount));
      } catch (err) {
        errors.push(`layout-token fix failed for ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (group.cssAnchors.length > 0) {
      try {
        const result = applyFocusRingFix(filePath);
        if (result.applied) {
          applied.push(...group.cssAnchors);
        } else {
          skipped.push(...group.cssAnchors);
        }
      } catch (err) {
        errors.push(`focus-ring fix failed for ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    results.push({
      filePath,
      applied,
      skipped,
      ...(errors.length > 0 ? { errors } : {}),
    });
  }

  return results;
}
