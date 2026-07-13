import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("home action translation contract", () => {
  it("keeps locate and follow feedback behind the shared PT/EN catalog", () => {
    const page = readFileSync(resolve(process.cwd(), "src/app/page.tsx"), "utf8");

    expect(page).toContain('t(lang, "toast.centeredOn")');
    expect(page).toContain('tFmt(lang, "toast.centeredOnDescription"');
    expect(page).toContain('t(lang, "toast.alertsUnavailable")');
    expect(page).toContain('t(lang, "toast.followUpdateFailed")');
    expect(page).toContain('tFmt(lang, "toast.followedLocalDescription"');
    expect(page).not.toContain("Alerts are unavailable on this device.");
    expect(page).not.toContain("Unable to update the alert.");
  });

  it("does not start an unused weather-warning polling request on the home page", () => {
    const page = readFileSync(resolve(process.cwd(), "src/app/page.tsx"), "utf8");

    expect(page).not.toContain("useWeatherWarningsNew");
    expect(page).not.toContain("weatherWarnings");
  });

  it("keeps incident-news ownership inside the detail panel", () => {
    const page = readFileSync(resolve(process.cwd(), "src/app/page.tsx"), "utf8");

    expect(page).not.toContain("useMatchedIncidentNews");
    expect(page).not.toContain("mobileSidebarOpen");
    expect(page).not.toContain("setMobileSidebarOpen");
    expect(page).not.toContain("setFireRiskFilter");
  });
});
