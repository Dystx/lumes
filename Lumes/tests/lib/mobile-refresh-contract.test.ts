import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fetchSource = readFileSync(resolve(process.cwd(), "src/lib/use-fetch.ts"), "utf8");
const appDataSource = readFileSync(resolve(process.cwd(), "src/lib/use-app-data.ts"), "utf8");
const pageSource = readFileSync(resolve(process.cwd(), "src/app/page.tsx"), "utf8");
const mobileViewSource = readFileSync(resolve(process.cwd(), "src/components/mobile/mobile-view.tsx"), "utf8");

describe("mobile pull-to-refresh contract", () => {
  it("exposes an awaitable refresh that settles after the active request generation", () => {
    expect(fetchSource).toContain("refetchAsync: () => Promise<void>");
    expect(fetchSource).toContain("pendingRefetchesRef");
    expect(fetchSource).toContain("requestGenerationRef");
    expect(fetchSource).toContain("let cancelled = false");
    expect(fetchSource).not.toContain("cancelledRef");
    expect(fetchSource).toContain("setError(null);");
    expect(fetchSource).toContain("pending.forEach((resolve) => resolve())");
  });

  it("clears a previous refresh error before scheduling a manual retry", () => {
    const refetchStart = fetchSource.indexOf("const refetch = useCallback");
    const refetchEnd = fetchSource.indexOf("const refetchAsync", refetchStart);
    const refetchBody = fetchSource.slice(refetchStart, refetchEnd);
    expect(refetchBody).toContain("setError(null);");
    expect(refetchBody).toContain("setLoading(true);");
    expect(refetchBody.indexOf("setError(null);")).toBeLessThan(refetchBody.indexOf("setTick"));

    const asyncRefetchStart = fetchSource.indexOf("const refetchAsync = useCallback");
    const asyncRefetchEnd = fetchSource.indexOf("const setData", asyncRefetchStart);
    const asyncRefetchBody = fetchSource.slice(asyncRefetchStart, asyncRefetchEnd);
    expect(asyncRefetchBody).toContain("setError(null);");
    expect(asyncRefetchBody).toContain("setLoading(true);");
  });

  it("forwards the awaitable refresh through the live-incidents adapter", () => {
    expect(appDataSource).toContain("refetchAsync: r.refetchAsync");
  });

  it("keeps the mobile refresh indicator pending until live data and dashboard settle", () => {
    expect(pageSource).toContain("liveIncidents.refetchAsync()");
    expect(pageSource).toContain("dashboard.refetchAsync()");
    expect(pageSource).toContain("await Promise.all([");
  });

  it("explains refresh failure inside the active incidents sheet", () => {
    expect(mobileViewSource).toContain('data-testid="mobile-data-trust-warning"');
    expect(mobileViewSource).toContain("A atualização falhou");
    expect(mobileViewSource).toContain("Refresh failed");
  });
});
