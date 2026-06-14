import { Issue } from "../types";

export function generateAdvice(topOffenses: Issue[]): string[] {
  const advice = new Set<string>();
  for (const issue of topOffenses.slice(0, 5)) {
    if (issue.advice) advice.add(issue.advice);
  }
  return Array.from(advice);
}
