import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("public locale contract", () => {
  it("declares Portuguese-only public routes consistently", () => {
    const layout = readFileSync(resolve(process.cwd(), "src/app/layout.tsx"), "utf8");
    const shell = readFileSync(resolve(process.cwd(), "src/components/public/public-page-shell.tsx"), "utf8");
    expect(layout).toContain('<html lang="pt-PT"');
    expect(shell).toContain('<main lang="pt-PT"');
  });
});
