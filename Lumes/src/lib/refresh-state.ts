export type RefreshOutcome = "success" | "error" | null;

export function resolveRefreshOutcome(input: {
  inFlight: boolean;
  startedAt: number | null;
  loading: boolean;
  failed: boolean;
  refetchedAt: Date | null | undefined;
  previousRefetchedAt: Date | null;
}): RefreshOutcome {
  if (!input.inFlight) return null;
  if (input.failed) return "error";
  if (input.startedAt === null || input.loading) return null;
  if (input.refetchedAt === null || input.refetchedAt === undefined) return null;
  if (input.refetchedAt === input.previousRefetchedAt) return null;

  const fetchedAt = input.refetchedAt.getTime();
  return fetchedAt >= input.startedAt ? "success" : null;
}
