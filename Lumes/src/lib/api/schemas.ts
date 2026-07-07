// Zod schemas for POST endpoints (F-24, refactor plan).
//
// Use these in route handlers to validate request bodies before processing.
// Centralised so a single change updates all consumers.

import { z } from "zod";

export const followSchema = z.object({
  incidentId: z.string().min(1).max(120),
});

export const newsletterSubscribeSchema = z.object({
  email: z.string().email().max(200),
  locale: z.enum(["pt", "en"]).default("pt"),
  /** Optional regions to subscribe to (e.g. ["Norte", "Centro"]) */
  regions: z.array(z.string().min(1).max(60)).max(20).optional(),
});

export const newsletterConfirmSchema = z.object({
  /** Token sent in the email confirmation link */
  token: z.string().min(20).max(200),
});

export const newsletterUnsubscribeSchema = z.object({
  email: z.string().email().max(200),
  token: z.string().min(20).max(200).optional(),
});

export const reportSchema = z.object({
  type: z.enum(["smoke", "flame", "road_closure", "evacuation", "contained"]),
  /** Free-text description, max 500 chars */
  description: z.string().max(500).optional(),
  /** Reporter name (optional) */
  name: z.string().max(80).optional(),
  /** Latitude / longitude, 6 decimal places max */
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
  /** Optional municipality/parish hints */
  municipality: z.string().max(80).optional(),
  parish: z.string().max(80).optional(),
});

export const alertSubscribeSchema = z.object({
  /** Topic to subscribe to */
  topic: z.string().min(1).max(80),
  /** Region(s) */
  regions: z.array(z.string().min(1).max(60)).max(20).optional(),
  /** Severity threshold */
  minSeverity: z.enum(["low", "medium", "high", "critical"]).default("high"),
  /** Optional contact info */
  email: z.string().email().max(200).optional(),
  pushToken: z.string().max(500).optional(),
});

// ── Helper ─────────────────────────────────────────────────────────────

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Validate a request body against a zod schema. Returns the parsed data on
 * success or a 400-safe error message on failure.
 */
export function validateBody<T>(
  schema: z.ZodSchema<T>,
  body: unknown,
): ValidationResult<T> {
  const r = schema.safeParse(body);
  if (r.success) return { ok: true, data: r.data };
  const first = r.error.issues[0];
  return { ok: false, error: first ? `${first.path.join(".")}: ${first.message}` : "Invalid input", path: first?.path as readonly (string | number)[] | undefined };
}