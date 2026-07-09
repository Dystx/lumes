export type DataState = "healthy" | "stale" | "fallback" | "empty" | "retryable-error";
export type DataStateLocale = "pt" | "en";

export interface DataStateInput {
  count?: number | null;
  fallback?: boolean;
  stale?: boolean;
  retryableError?: boolean;
}

export interface DataStateMeta {
  state: DataState;
  updatedAt: string;
  reason?: string;
  sourceUpdatedAt?: string;
  source?: string;
}

export function classifyDataState(input: DataStateInput): DataState {
  if (input.retryableError) return "retryable-error";
  if (input.fallback) return "fallback";
  if (input.stale) return "stale";
  if (input.count === 0) return "empty";
  return "healthy";
}

export function dataStateMessage(state: DataState, locale: DataStateLocale): string {
  const messages: Record<DataStateLocale, Record<DataState, string>> = {
    pt: {
      healthy: "Dados atualizados.",
      stale: "Estes dados podem estar desatualizados.",
      fallback: "A mostrar dados alternativos; a fonte em direto está indisponível.",
      empty: "Não existem dados disponíveis neste momento.",
      "retryable-error": "Não foi possível atualizar estes dados. Tente novamente.",
    },
    en: {
      healthy: "Data is up to date.",
      stale: "This data may be out of date.",
      fallback: "Showing fallback data; live source is unavailable.",
      empty: "No data is available right now.",
      "retryable-error": "Unable to refresh this data. Try again.",
    },
  };
  return messages[locale][state];
}

export function createDataStateMeta(
  state: DataState,
  reason?: string,
  sourceUpdatedAt?: string,
  source?: string,
): DataStateMeta {
  return {
    state,
    updatedAt: new Date().toISOString(),
    ...(reason ? { reason } : {}),
    ...(sourceUpdatedAt ? { sourceUpdatedAt } : {}),
    ...(source ? { source } : {}),
  };
}
