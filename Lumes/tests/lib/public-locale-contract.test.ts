import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { statusBaseUrl } from "@/app/status/page";

describe("public locale contract", () => {
  it("declares Portuguese-only public routes consistently", () => {
    const layout = readFileSync(resolve(process.cwd(), "src/app/layout.tsx"), "utf8");
    const shell = readFileSync(resolve(process.cwd(), "src/components/public/public-page-shell.tsx"), "utf8");
    expect(layout).toContain('<html lang="pt-PT"');
    expect(shell).toContain('<main lang="pt-PT"');
  });

  it("uses the canonical public origin when production has no base-url env", () => {
    expect(statusBaseUrl({ NODE_ENV: "production" })).toBe("https://lumes.pt");
    expect(statusBaseUrl({ NODE_ENV: "development", PORT: "3311" })).toBe("http://127.0.0.1:3311");
    expect(statusBaseUrl({ NEXT_PUBLIC_BASE_URL: "https://preview.example/" })).toBe("https://preview.example");
  });
});
