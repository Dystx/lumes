export interface ServerFailureContext {
  route: string;
  retryable?: boolean;
}

/**
 * Server failures are emitted as a compact JSON record. Deliberately omit the
 * error message and request payload because both can include personal data.
 */
export function logServerFailure(
  event: string,
  error: unknown,
  context: ServerFailureContext,
): void {
  const errorName = error instanceof Error ? error.name : "UnknownError";
  console.error(JSON.stringify({
    level: "error",
    event,
    route: context.route,
    retryable: context.retryable ?? false,
    errorName,
  }));
}
