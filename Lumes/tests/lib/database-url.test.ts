import { describe, expect, it } from "vitest";
import { resolveDatabaseUrl } from "@/lib/database-url";

describe("database URL resolution", () => {
  const cwd = "/workspace/lumes";

  it("uses an absolute project database when configuration is missing", () => {
    expect(resolveDatabaseUrl({ cwd })).toBe("file:/workspace/lumes/db/custom.db");
  });

  it("keeps an existing configured SQLite path", () => {
    expect(resolveDatabaseUrl({
      cwd,
      configuredUrl: "file:../db/custom.db?connection_limit=1",
      fileExists: (filePath) => filePath === "/workspace/lumes/db/custom.db",
    })).toBe("file:../db/custom.db?connection_limit=1");
  });

  it("recovers to the project database when a configured file is missing", () => {
    expect(resolveDatabaseUrl({
      cwd,
      configuredUrl: "file:/private/old-machine/lumes.db",
      fileExists: () => false,
    })).toBe("file:/workspace/lumes/db/custom.db");
  });

  it("preserves non-SQLite provider URLs", () => {
    expect(resolveDatabaseUrl({ cwd, configuredUrl: "postgresql://localhost/lumes" })).toBe("postgresql://localhost/lumes");
  });
});
