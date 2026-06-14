import type { Issue } from "../types.js";

export interface AutopsyBucket {
  name: string;
  explanation: string;
  ruleIds: string[];
}

export interface AutopsyResult {
  bucket: AutopsyBucket;
  offenses: Issue[];
}

export const AUTOPSY_BUCKETS: AutopsyBucket[] = [
  {
    name: "Token bias",
    explanation:
      "The model reached for raw className values instead of using design-system tokens.",
    ruleIds: [
      "arbitrary-tailwind",
      "arbitrary-color",
      "off-grid-spacing",
      "magic-z-index",
      "negative-margin",
      "off-scale-font-size",
      "low-contrast",
      "low-contrast-text",
      "generic-style-prop",
      "excessive-radius",
      "max-radius",
    ],
  },
  {
    name: "State soup",
    explanation:
      "More state is declared than necessary, often creating spooky sync logic.",
    ruleIds: [
      "excessive-use-effect",
      "unused-state-setter",
      "zombie-state",
      "dead-state-setter",
      "prop-to-state-sync",
    ],
  },
  {
    name: "Inline temptation",
    explanation:
      "Styles, handlers, data, and copy are inlined instead of abstracted.",
    ruleIds: [
      "inline-style",
      "inline-event-handler",
      "business-logic-in-jsx",
      "inline-data-array",
      "placeholder-copy",
    ],
  },
  {
    name: "Pattern lock-in",
    explanation:
      "The same AI-default visual pattern is repeated instead of being questioned.",
    ruleIds: [
      "no-glassmorphism",
      "no-gradient-hero",
      "glassmorphism",
      "no-saas-template-structure",
    ],
  },
  {
    name: "Comment theater",
    explanation: "Self-evident or generated comments add noise without intent.",
    ruleIds: ["redundant-ai-comment"],
  },
  {
    name: "Primitive reinvention",
    explanation:
      "Native elements are doing the job of registered design-system primitives.",
    ruleIds: [
      "div-on-click",
      "span-on-click",
      "missing-registry-component",
      "img-missing-alt",
      "icon-button-missing-label",
    ],
  },
  {
    name: "Flat design",
    explanation:
      "Safe grays, generic type, and soft radii avoid making a brand decision.",
    ruleIds: ["no-generic-font-stack", "visual-only-heading"],
  },
];

export function buildAutopsy(issues: Issue[]): AutopsyResult[] {
  const results: AutopsyResult[] = [];
  for (const bucket of AUTOPSY_BUCKETS) {
    const offenses = issues.filter((issue) => bucket.ruleIds.includes(issue.ruleId));
    if (offenses.length > 0) {
      results.push({ bucket, offenses });
    }
  }
  return results;
}
