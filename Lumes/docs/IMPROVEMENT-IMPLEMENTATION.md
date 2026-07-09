# Lumes.pt — Implementation Plan

**Companion to**: `REFACTOR-PLAN.md` (review findings)
**Date**: 2026-07-06
**Status**: Active implementation

This document specifies HOW to fix the issues in REFACTOR-PLAN.md, ordered by impact and dependency.

---

## Phase 1: Critical bug fixes (P0) — execute now

### F-04: Error boundary (Next.js App Router)
**File**: `src/app/error.tsx` (new)
**Pattern**: Next.js 16 `error.tsx` file convention. Must be a Client Component. Receives `error`, `reset` props.

```tsx
"use client";
import { useEffect } from "react";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/use-language";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { language } = useLanguage();
  useEffect(() => {
    console.error("[lumes]", error);
  }, [error]);

  return (
    <main className="h-screen flex flex-col items-center justify-center bg-[var(--ember-bg)] text-[var(--ember-text)] gap-4 p-6">
      <div className="text-6xl">🔥</div>
      <h1 className="text-xl font-semibold">
        {language === "pt" ? "Algo correu mal" : "Something went wrong"}
      </h1>
      <p className="text-sm text-[var(--ember-text-muted)] max-w-md text-center">
        {error.message || "Unknown error"}
      </p>
      {error.digest && (
        <code className="text-[10px] text-[var(--ember-text-faint)] font-mono">
          {error.digest}
        </code>
      )}
      <button
        onClick={reset}
        className="px-4 py-2 rounded-md bg-[var(--ember-accent)] text-[var(--ember-bg)] font-medium text-sm hover:opacity-90"
      >
        {language === "pt" ? "Tentar novamente" : "Try again"}
      </button>
    </main>
  );
}
```

Also: `src/app/global-error.tsx` for root layout errors.

**Reference**: https://nextjs.org/docs/app/api-reference/file-conventions/error

---

### F-02: `/api/dashboard` 500 → use Prisma directly
**File**: `src/app/api/dashboard/route.ts`
**Root cause**: Self-fetches `http://localhost:${PORT}/api/incidents` — fragile in containerized envs.
**Fix**: Replace with direct Prisma queries against the persisted `Incident` table.

```ts
import { db } from "@/lib/db";

// Inside GET:
const incidents = await db.incident.findMany({
  where: { lastSeen: { gte: new Date(Date.now() - 24 * 3600 * 1000) } },
  select: {
    id: true, severity: true, status: true,
    municipality: true, district: true, parish: true,
    estimatedAreaHa: true, firstDetected: true, lastSeen: true,
    geometry: true, // stored as GeoJSON string in DB
    rawProperties: true, // contains statusText, statusGroup, personnelTotal, etc.
  },
});
```

**Reference**: https://www.prisma.io/docs/orm/prisma-client/queries/aggregation-grouping-summarizing

Pattern for `byStatusGroup`:
```ts
const groups = await db.incident.groupBy({
  by: ['status'],
  _count: true,
});
// Then merge with rawProperties.statusGroup from incidents array
```

---

### F-03: i18n typo fix
**File**: `src/lib/i18n.ts` line ~56
**Change**: `districts: { pt: "concelhos", en: "districts" }` 
- "conselhos" → "concelhos" (correct spelling of "municipalities" in PT)

Add a vitest assertion:
```ts
it("translates sidebar.districts to 'concelhos' in PT", () => {
  expect(t("pt", "sidebar.districts")).toBe("concelhos");
});
```

---

### F-01: Map marker clicks don't open detail panel
**File**: `src/components/ember-map.tsx`
**Root cause hypothesis**: `LAYER_IDS.incidentFill` may not exist when click handler is registered, OR the cluster layer is intercepting clicks.

**Fix approach**:
1. Verify `LAYER_IDS.incidentFill` and `incidentStroke` exist before the click handler queries
2. The click handler currently does:
   ```ts
   const features = map.queryRenderedFeatures(e.point, {
     layers: [LAYER_IDS.incidentFill, LAYER_IDS.incidentStroke],
   });
   ```
3. If layers aren't rendered yet (data still loading), `queryRenderedFeatures` returns nothing
4. Add a guard: if no incident layers exist, don't try to query

**MapLibre best practice**: Listen to `map.on('sourcedata')` or `styledata` to know when layers are loaded.

**Reference**: https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/#queryrenderedfeatures

---

### F-06: Remove brand duplicate from dashboard header
**Files**: `src/app/page.tsx` (DashboardPanel header section)
**Action**: Remove the `<div className="px-5 py-4 border-b ... flex items-center gap-2">` with the Lumes logo + WILDFIRE INTEL tagline + LIVE indicator. Keep only the "Situational Awareness / Live overview · Portugal" sub-header (or merge into one).

---

### F-05: Mobile responsive header
**Files**: `src/app/page.tsx`
**Fix**:
- On `< md`: header becomes sticky at top, hamburger expands to full-screen drawer
- Remove absolute positioning on mobile
- Map controls (+, -, locate) become floating buttons at bottom-right
- Add sticky bottom nav: Map | Dashboard | Reports | More

Pattern (Tailwind):
```tsx
<header className="sticky md:absolute top-0 left-0 right-0 z-20 h-16 ...">
```

---

## Phase 2: Backend hardening (P1) — same week

### F-07: Regional commands compression + simplification
**File**: `src/app/api/regional-commands/route.ts`
**Fix**:
```ts
import { simplify } from "turf";

const simplified = {
  ...cmd,
  geometry: cmd.geometry
    ? simplify(cmd.geometry, { tolerance: 0.01, highQuality: false })
    : null,
};
```

Add cache headers:
```ts
headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" }
```

**Reference**: https://turfjs.org/docs/api/simplify

### F-21: Centralized cache abstraction
**File**: `src/lib/api/cache.ts` (new)
```ts
interface CacheEntry<T> { ts: number; data: T }
const store = new Map<string, CacheEntry<unknown>>();

export async function cached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.ts < ttlMs) return hit.data as T;
  const data = await loader();
  store.set(key, { ts: Date.now(), data });
  return data;
}
```

Replace all `let cache: { ... } | null` patterns in route.ts files.

### F-22: Zod validation
**File**: `src/lib/api/schemas.ts` (new)
```ts
import { z } from "zod";

export const followSchema = z.object({
  incidentId: z.string().min(1).max(100),
});

export const newsletterSubscribeSchema = z.object({
  email: z.string().email().max(200),
  locale: z.enum(["pt", "en"]).default("pt"),
});

// Helper:
export function validateBody<T>(schema: z.ZodSchema<T>) {
  return (body: unknown): { ok: true; data: T } | { ok: false; error: string } => {
    const r = schema.safeParse(body);
    if (r.success) return { ok: true, data: r.data };
    return { ok: false, error: r.error.issues[0]?.message ?? "Invalid input" };
  };
}
```

Apply to: `/api/follow`, `/api/reports`, `/api/newsletter/*`, `/api/alerts/*`.

### F-23: Rate limiting
**File**: `src/lib/api/rate-limit.ts` (new)
```ts
const buckets = new Map<string, { tokens: number; ts: number }>();
const RATE = 60; // req/min
const WINDOW = 60_000;

export function rateLimit(ip: string, limit = RATE): boolean {
  const now = Date.now();
  const b = buckets.get(ip) ?? { tokens: limit, ts: now };
  const elapsed = now - b.ts;
  const refill = (elapsed / WINDOW) * limit;
  const tokens = Math.min(limit, b.tokens + refill);
  if (tokens < 1) {
    buckets.set(ip, { tokens, ts: now });
    return false;
  }
  buckets.set(ip, { tokens: tokens - 1, ts: now });
  return true;
}
```

### F-09: Delete Post model
**File**: `prisma/schema.prisma`
**Action**: Remove `model Post { ... }` block. Run `prisma migrate dev --name drop-post-model`.

---

## Phase 3: Frontend polish (P2) — week 2

### Visual quick wins

**Counter card redesign** (in page.tsx):
```tsx
<button className="...">
  <span className="text-9xl font-bold tabular-nums leading-none">30</span>
  <div>
    <span className="text-xs uppercase tracking-wider">Total</span>
    <Icon className="w-4 h-4" />
  </div>
</button>
```
Make the number HUGE (60-80px), label small. Single hero metric per card.

**Wind direction arrow** in detail panel:
```tsx
<div className="relative">
  <ArrowUp className="w-6 h-6" style={{ transform: `rotate(${windDeg}deg)` }} />
  <span className="text-[9px]">SW</span>
</div>
```

**Active filter chips** in top header:
```tsx
{criticalOnly && <Chip onClear={() => setCriticalOnly(false)}>Critical only</Chip>}
{phaseFilter && <Chip onClear={() => setPhaseFilter(null)}>Em Conclusão</Chip>}
```

**Loading skeletons** for dashboard:
```tsx
<Skeleton className="h-8 w-16" /> // for counters
<Skeleton className="h-4 w-32" /> // for labels
```

**Mobile bottom nav** (new component):
```tsx
// src/components/mobile-bottom-nav.tsx
<nav className="fixed bottom-0 left-0 right-0 md:hidden h-14 bg-[var(--ember-surface)] border-t flex justify-around">
  <button><Map /> Map</button>
  <button><Activity /> Dashboard</button>
  <button><FileText /> Reports</button>
  <button><MoreHorizontal /> More</button>
</nav>
```

**Display font** for "Lumes":
```tsx
// tailwind.config.ts
fontFamily: {
  display: ['"Outfit"', 'system-ui', 'sans-serif'],
},
```
Or use Google Fonts `Outfit` for a modern display feel.

### F-26: Split page.tsx

**Strategy**: Start with leaf components (no children), work up.

**Leaves** (easiest to extract):
1. `ToggleRow` — generic toggle row
2. `DashStat` — counter card
3. `ResourceStat` — resource card  
4. `CollapsibleLegend` — map legend
5. `IncidentMarker` — map marker (already inline in ember-map)

**Branches**:
6. `OperationalPhases` — bar chart
7. `PriorityIncidentsList`
8. `QuickStats`
9. `FireRiskSummary`
10. `ConditionsSummary`

**Roots**:
11. `DashboardPanel` — becomes thin wrapper
12. `Sidebar` — thin wrapper
13. `IncidentDetailPanel` — thin wrapper
14. `page.tsx` — top-level layout only

Each extracted component gets its own file under `src/components/{dashboard,sidebar,incident-detail}/`.

---

## Phase 4: State management (P3) — week 3

### F-30: Generic useFetch

**File**: `src/lib/use-fetch.ts`
```ts
import { useState, useEffect, useCallback } from "react";

export function useFetch<T>(url: string, opts: {
  refreshMs?: number | null;
  enabled?: boolean;
  fallback?: T | null;
  transform?: (raw: any) => T;
} = {}) {
  const { refreshMs = null, enabled = true, fallback = null, transform } = opts;
  const [data, setData] = useState<T | null>(fallback);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refetchedAt, setRefetchedAt] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: any = null;

    async function load() {
      try {
        const res = await fetch(url, { cache: "default" });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        const json = await res.json();
        if (!cancelled) {
          setData(transform ? transform(json) : json);
          setLoading(false);
          setError(null);
          setRefetchedAt(new Date());
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    }
    load();
    if (refreshMs) timer = setInterval(load, refreshMs);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [url, refreshMs, enabled, tick, transform]);

  return { data, loading, error, refetchedAt, refetch };
}
```

### F-31: zustand stores

**File**: `src/store/ui-store.ts`
```ts
import { create } from "zustand";

interface UIState {
  basemap: "dark" | "light" | "satellite";
  setBasemap: (b: "dark" | "light" | "satellite") => void;
  // ... 30+ filter / layer / selection states
}

export const useUIStore = create<UIState>((set) => ({
  basemap: "dark",
  setBasemap: (basemap) => set({ basemap }),
  // ...
}));
```

---

## Phase 5: Dead code + tests (P3) — week 3

### F-28: Delete unused shadcn components
**Keep**: `chart.tsx`, `scroll-area.tsx`, `sheet.tsx`, `sonner.tsx`, `toaster.tsx`
**Delete**: 25 others (aspect-ratio, alert-dialog, pagination, tabs, card, slider, popover, progress, input-otp, hover-card, resizable, label, navigation-menu, breadcrumb, calendar, checkbox, command, context-menu, dialog, dropdown-menu, menubar, radio-group, scroll-area (kept), select, separator, sheet (kept), skeleton, switch, table, textarea, toggle, toggle-group, tooltip)

### F-29: Trim sample-data.ts
**Keep**: ~100 LOC of currently-used SAMPLE_INCIDENTS for playback mode
**Delete**: Generated `PLAYBACK_FRAMES` (only used in old playback path)

### Phase 7: Playwright CI smoke test
**File**: `tests/e2e/smoke.spec.ts`
```ts
import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page, context }) => {
  await context.clearCookies();
  await page.goto("https://lumes.pt/");
  await page.evaluate(async () => {
    const rs = await navigator.serviceWorker.getRegistrations();
    for (const r of rs) await r.unregister();
    const keys = await caches.keys();
    for (const k of keys) await caches.delete(k);
  });
  await page.reload();
  await page.waitForTimeout(5000);
});

test("page loads with all panels", async ({ page }) => {
  await expect(page.locator('[class*="w-[360px]"]')).toBeVisible();
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await expect(page.locator("aside.w-72")).toBeVisible();
});

test("critical card opens detail panel", async ({ page }) => {
  await page.click("button:has-text('CRITICAL')");
  await page.waitForTimeout(2000);
  await expect(page.locator("text=CONDITIONS")).toBeVisible();
});

test("map marker click opens detail panel", async ({ page }) => {
  // Find a known marker position
  await page.mouse.click(720, 400);
  await page.waitForTimeout(2000);
  // Either a detail panel opened, or it didn't
  // (this test serves as a regression for F-01)
  const panelOpen = await page.locator('[class*="md:w-[360px]"][class*="border-r"]').count();
  expect(panelOpen).toBeGreaterThan(0);
});
```

---

## Execution order (this session)

**Hour 1**: F-04 (error boundary), F-03 (i18n typo), F-06 (remove brand dup) — 3 small fixes

**Hour 2**: F-02 (dashboard 500) — moderate, requires DB integration

**Hour 3**: F-01 (map clicks) — needs investigation, may be tricky

**Hour 4**: F-05 (mobile header) — visual fix

**Hour 5**: F-07 (regional-commands), F-09 (delete Post) — backend cleanup

**Hour 6**: Visual polish — counter cards, hero metrics, mobile bottom nav

**Hour 7+**: Build, deploy, verify, screenshot

---

## Verification

After each phase:
1. `bun run test` — 10/10 pass
2. `bun run build` — green
3. `bun run audit.js` — all interactions still work
4. Visual screenshot — confirm fix
5. Deploy to lumes.pt
6. Audit live site

---