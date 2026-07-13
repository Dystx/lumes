import type { Language } from "@/lib/i18n";

/** Format an ISO timestamp relative to a supplied clock for deterministic tests. */
export function timeAgo(iso: string, lang: Language = "en", now = Date.now()): string {
  const then = new Date(iso).getTime();
  const diffMin = Math.max(0, Math.round((now - then) / 60000));
  if (diffMin < 1) return lang === "pt" ? "agora" : "just now";
  if (diffMin < 60) return lang === "pt" ? `há ${diffMin} min` : `${diffMin}m ago`;

  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return lang === "pt" ? `há ${diffHr} h` : `${diffHr}h ago`;

  const diffDay = Math.round(diffHr / 24);
  return lang === "pt" ? `há ${diffDay} d` : `${diffDay}d ago`;
}
