import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("incident filter URL persistence boundary", () => {
  it("hydrates before writing and preserves browser navigation semantics", () => {
    const page = readFileSync("src/app/page.tsx", "utf8");
    const hook = readFileSync("src/lib/use-incident-filter-url.ts", "utf8");

    expect(page).toContain('import { useIncidentFilterUrl } from "@/lib/use-incident-filter-url";');
    expect(page).toContain("useIncidentFilterUrl();");
    expect(hook).toContain("parseIncidentFilterQuery");
    expect(hook).toContain("writeIncidentFilterQuery");
    expect(hook).toContain("hydratedRef");
    expect(hook).toContain('addEventListener("popstate"');
    expect(hook).toContain("history.replaceState");
    expect(hook).toContain("SEARCH_WRITE_DEBOUNCE_MS");
    expect(hook).not.toContain("useRouter");
  });
});
