import { basename, isAbsolute, relative, resolve } from 'node:path';
import type { Category, Issue, ProjectReport, Severity } from '../types.js';

interface SarifArtifactLocation {
  uri: string;
}

interface SarifRegion {
  startLine: number;
  startColumn: number;
}

interface SarifPhysicalLocation {
  artifactLocation: SarifArtifactLocation;
  region: SarifRegion;
}

interface SarifLocation {
  physicalLocation: SarifPhysicalLocation;
}

interface SarifMessage {
  text: string;
}

interface SarifRule {
  id: string;
  name: string;
  shortDescription: {
    text: string;
  };
  properties: {
    aiSpecific: boolean;
    category: Category;
    severity: Severity;
  };
}

interface SarifResult {
  ruleId: string;
  message: SarifMessage;
  locations: SarifLocation[];
}

interface SarifToolDriver {
  name: string;
  version: string;
  rules: SarifRule[];
}

interface SarifTool {
  driver: SarifToolDriver;
}

interface SarifRun {
  tool: SarifTool;
  results: SarifResult[];
}

interface SarifLog {
  $schema: string;
  version: string;
  runs: SarifRun[];
}

function buildArtifactUri(filePath: string | undefined, cwd: string | undefined): string {
  if (!filePath) {
    return '.';
  }
  if (cwd) {
    const absoluteFilePath = isAbsolute(filePath) ? filePath : resolve(cwd, filePath);
    return relative(cwd, absoluteFilePath);
  }
  if (isAbsolute(filePath)) {
    return basename(filePath);
  }
  return filePath;
}

function buildRuleFromIssue(issue: Issue): SarifRule {
  return {
    id: issue.ruleId,
    name: issue.ruleId,
    shortDescription: {
      text: issue.ruleId,
    },
    properties: {
      aiSpecific: issue.aiSpecific,
      category: issue.category,
      severity: issue.severity,
    },
  };
}

function buildResultFromIssue(issue: Issue, cwd: string | undefined): SarifResult {
  return {
    ruleId: issue.ruleId,
    message: {
      text: issue.message,
    },
    locations: [
      {
        physicalLocation: {
          artifactLocation: {
            uri: buildArtifactUri(issue.filePath, cwd),
          },
          region: {
            startLine: issue.line,
            startColumn: issue.column,
          },
        },
      },
    ],
  };
}

export function formatSarif(
  report: ProjectReport,
  options?: { cwd?: string },
): string {
  const rulesById = new Map<string, SarifRule>();
  for (const issue of report.issues) {
    if (!rulesById.has(issue.ruleId)) {
      rulesById.set(issue.ruleId, buildRuleFromIssue(issue));
    }
  }

  const rules = Array.from(rulesById.values()).sort((a, b) => a.id.localeCompare(b.id));
  const results = report.issues.map((issue) => buildResultFromIssue(issue, options?.cwd));

  const log: SarifLog = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'slop-audit',
            version: report.version,
            rules,
          },
        },
        results,
      },
    ],
  };

  return JSON.stringify(log, null, 2);
}
