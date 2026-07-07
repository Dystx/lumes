// CSRF protection helper for POST/PUT/DELETE endpoints.
//
// Validates the Origin header against an allowed list of hostnames.
// Browsers automatically include Origin on cross-origin requests; fetch()
// from the same origin also includes it.
//
// This is a defence-in-depth check, not a replacement for proper auth tokens.
// For browser clients, the SameSite cookie policy handles most CSRF; this
// catches server-to-server misconfiguration and explicitly cross-origin
// attack vectors.

import type { NextRequest } from "next/server";

const ALLOWED_HOSTNAMES = [
  "lumes.pt",
  "www.lumes.pt",
  "localhost",
  "127.0.0.1",
];

/** Returns true if the request Origin matches our allowed hostnames. */
export function isSafeOrigin(req: NextRequest): boolean {
  // GET / HEAD / OPTIONS requests don't mutate state — no CSRF check needed.
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    return true;
  }

  const origin = req.headers.get("origin");
  if (!origin) {
    // No origin header — typically same-origin browser request. Trust it
    // when Sec-Fetch-Site is "same-origin" (the browser tells us).
    const secFetchSite = req.headers.get("sec-fetch-site");
    if (secFetchSite === "same-origin" || secFetchSite === "none") return true;
    return false;
  }

  try {
    const url = new URL(origin);
    return ALLOWED_HOSTNAMES.includes(url.hostname);
  } catch {
    return false;
  }
}

/** Throws a 403 response if origin is not allowed. */
export function assertSafeOrigin(req: NextRequest): Response | null {
  if (isSafeOrigin(req)) return null;
  return new Response(
    JSON.stringify({ error: "Forbidden: cross-origin request rejected" }),
    { status: 403, headers: { "Content-Type": "application/json" } },
  );
}