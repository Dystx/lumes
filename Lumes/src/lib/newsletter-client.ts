import { normalizeDataStateMeta, type DataStateMeta } from "@/lib/data-state";

export type NewsletterSubscribeStatus = "pending_confirmation" | "already_subscribed";
export type NewsletterLocale = "pt" | "en";

export interface NewsletterSubscribeResponse {
  ok: boolean;
  status?: NewsletterSubscribeStatus;
  error?: string;
  dataState?: DataStateMeta;
}

const MAX_ERROR_LENGTH = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeError(value: unknown): string | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return null;
  const message = value.trim();
  return message.length > 0 && message.length <= MAX_ERROR_LENGTH ? message : null;
}

function normalizeStatus(value: unknown): NewsletterSubscribeStatus | undefined | null {
  if (value === undefined) return undefined;
  return value === "pending_confirmation" || value === "already_subscribed" ? value : null;
}

/** Normalize the public newsletter acknowledgement before UI state changes. */
export function normalizeNewsletterSubscribeResponse(value: unknown): NewsletterSubscribeResponse {
  if (!isRecord(value)) {
    throw new Error("Newsletter response was malformed");
  }

  const ok = value.ok === undefined ? false : value.ok;
  if (typeof ok !== "boolean") throw new Error("Newsletter response was malformed");

  const status = normalizeStatus(value.status);
  const error = normalizeError(value.error);
  if (status === null || error === null) {
    throw new Error("Newsletter response was malformed");
  }

  let dataState: DataStateMeta | undefined;
  if (value.dataState !== undefined) {
    const normalized = normalizeDataStateMeta(value.dataState);
    if (!normalized) throw new Error("Newsletter response was malformed");
    dataState = normalized;
  }

  if (ok && status === undefined) {
    throw new Error("Newsletter response was malformed");
  }

  return {
    ok,
    ...(status === undefined ? {} : { status }),
    ...(error === undefined ? {} : { error }),
    ...(dataState === undefined ? {} : { dataState }),
  };
}

/** Submit a newsletter request through a bounded response boundary. */
export async function submitNewsletterSubscription(
  email: string,
  locale: NewsletterLocale,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<NewsletterSubscribeResponse> {
  const response = await fetchImpl("/api/newsletter/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, locale }),
  });
  const raw: unknown = await response.json().catch(() => null);
  const data = normalizeNewsletterSubscribeResponse(raw);
  if (!response.ok || !data.ok) {
    throw new Error(data.error ?? data.dataState?.reason ?? "Unable to subscribe to the newsletter.");
  }
  return data;
}
