export type LiveStatusTransition = "fallback" | "restored";

export function resolveLiveStatusTransition(input: {
  previousUsingFallback: boolean;
  usingFallback: boolean;
  liveCount: number;
}): LiveStatusTransition | null {
  if (input.usingFallback && !input.previousUsingFallback) return "fallback";
  if (!input.usingFallback && input.previousUsingFallback && input.liveCount > 0) return "restored";
  return null;
}
