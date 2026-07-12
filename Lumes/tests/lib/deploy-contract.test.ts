import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

describe("deployment packaging contract", () => {
  const preflight = "deploy/preflight-assets.sh";
  const requiredAssets = [
    "public/manifest.json",
    "public/logo.svg",
    "public/sw.js",
    "public/offline.html",
    "public/robots.txt",
    "public/.well-known/security.txt",
  ];

  function createFixtureRoot(): string {
    const root = mkdtempSync(join(tmpdir(), "lumes-preflight-"));
    for (const asset of requiredAssets) {
      const path = join(root, asset);
      execFileSync("mkdir", ["-p", dirname(path)]);
      writeFileSync(path, asset);
    }
    return root;
  }

  function runPreflight(root: string, mode: "filesystem" | "git"): ReturnType<typeof spawnSync> {
    return spawnSync("bash", [preflight, root, mode], { encoding: "utf8" });
  }

  it("executes the filesystem preflight for a complete payload", () => {
    const root = createFixtureRoot();
    try {
      const result = runPreflight(root, "filesystem");
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("control-asset preflight passed (filesystem)");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails the filesystem preflight when a required asset is missing", () => {
    const root = createFixtureRoot();
    try {
      rmSync(join(root, "public/offline.html"));
      const result = runPreflight(root, "filesystem");
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("public/offline.html");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("requires a clean committed payload in git mode", () => {
    const root = createFixtureRoot();
    try {
      execFileSync("git", ["-C", root, "init", "-q"]);
      execFileSync("git", ["-C", root, "config", "user.email", "test@example.invalid"]);
      execFileSync("git", ["-C", root, "config", "user.name", "Lumes Test"]);
      execFileSync("git", ["-C", root, "add", "."]);
      execFileSync("git", ["-C", root, "commit", "-qm", "fixture"]);
      expect(runPreflight(root, "git").status).toBe(0);

      writeFileSync(join(root, "public/logo.svg"), "changed");
      const result = runPreflight(root, "git");
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("public/logo.svg");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("copies browser and public assets into the standalone bundle", () => {
    const script = readFileSync("deploy/deploy.sh", "utf8");
    const preflightSource = readFileSync(preflight, "utf8");
    expect(script).toContain('SERVER_ENTRY=".next/standalone/server.js"');
    expect(script).toContain('readlink -f "${SERVER_ENTRY}"');
    expect(script).toContain('bash "${ASSET_PREFLIGHT}" "${PWD}" filesystem');
    expect(script).toContain('bash "${ASSET_PREFLIGHT}" "${PWD}" git');
    expect(preflightSource).toContain('public/manifest.json');
    expect(preflightSource).toContain('public/.well-known/security.txt');
    expect(spawnSync("bash", ["-n", preflight]).status).toBe(0);
    expect(script).toContain('cp -R .next/static/. "${RUNTIME_DIR}/.next/static/"');
    expect(script).toContain('cp -R public/. "${RUNTIME_DIR}/public/"');
  });

  it("keeps local secrets, databases, tests, and build output out of rsync payloads", () => {
    const docs = readFileSync("docs/DEPLOY.md", "utf8");
    for (const exclusion of ["--exclude='.env*'", "--exclude='db/*.db'", "--exclude='tests'", "--exclude='.next'"]) {
      expect(docs).toContain(exclusion);
    }
  });

  it("protects HTML and control assets from shared-cache staleness", () => {
    const config = readFileSync("next.config.ts", "utf8");
    expect(config).toContain('source: "/"');
    expect(config).toContain('source: "/status"');
    expect(config).toContain('source: "/privacy"');
    expect(config).toContain('source: "/newsletter"');
    expect(config).toContain('const noStoreHtmlHeaders = [{ key: "Cache-Control", value: "no-store" }]');

    const cloudflare = readFileSync("deploy/cf-setup.sh", "utf8");
    expect(cloudflare).toContain('upsert_cache_rule "Bypass public HTML and control assets"');
    expect(cloudflare).toContain('"/manifest.json" "/sw.js"');
  });

  it("keeps the browser control assets in the source payload", () => {
    for (const asset of requiredAssets) expect(existsSync(asset)).toBe(true);
    const manifest = JSON.parse(readFileSync("public/manifest.json", "utf8")) as { icons?: Array<{ src?: string }> };
    for (const icon of manifest.icons ?? []) {
      expect(icon.src).toBeTruthy();
      expect(existsSync(`public/${String(icon.src).replace(/^\//, "")}`)).toBe(true);
    }
  });

  it("ships a read-only HTTPS verifier for the authorized release gate", () => {
    expect(existsSync("deploy/verify-production.sh")).toBe(true);
    const verifier = readFileSync("deploy/verify-production.sh", "utf8");
    expect(verifier).toContain("https://lumes.pt");
    expect(verifier).toContain("/manifest.json");
    expect(verifier).toContain("/sw.js");
    expect(verifier).toContain("/api/health");
    expect(verifier).toContain("/api/source-health");
    expect(verifier).toContain("manifest-assets.txt");
    expect(verifier).toContain("no absolute icon URLs found");
    expect(verifier).toContain("no-store");
    expect(verifier).toContain("GET requests only");
  });

  it("documents a tracked-payload preflight for control assets", () => {
    const docs = readFileSync("docs/DEPLOY.md", "utf8");
    expect(docs).toContain("git ls-files --error-unmatch public/manifest.json public/logo.svg public/sw.js public/offline.html public/robots.txt public/.well-known/security.txt");
  });

  it("uses the system Bun binary for the production app and ingest timer", () => {
    const installer = readFileSync("deploy/install-lumes.sh", "utf8");
    expect(installer).toContain("ExecStart=/usr/local/bin/bun ${APP_DIR}/.next/standalone/server.js");
    expect(installer).toContain("ExecStart=/usr/local/bin/bun ${APP_DIR}/scripts/ingest.ts");
    expect(installer).toContain('systemctl --user enable --now "${SLUG}.service" "${SLUG}-ingest.timer"');
  });

  it("keeps build tooling installed until after the standalone build", () => {
    const installer = readFileSync("deploy/install-lumes.sh", "utf8");
    expect(installer).toContain('bun install --frozen-lockfile && bun run build');
    expect(installer).not.toContain('bun install --frozen-lockfile --production && bun run build');
  });

  it("pins the Bun toolchain and prepares CI's isolated database", () => {
    const packageJson = readFileSync("package.json", "utf8");
    expect(packageJson).toContain('"packageManager": "bun@1.3.4"');
    expect(packageJson).toContain('"bun": "1.3.4"');
    const ci = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(ci).toContain("bun-version: 1.3.4");
    expect(ci).toContain("Prepare isolated empty database");
    expect(ci).toContain("bunx prisma db push --skip-generate");
  });

  it("keeps the browser security contract explicit for map providers", () => {
    const config = readFileSync("next.config.ts", "utf8");
    expect(config).toContain("frame-ancestors 'none'");
    expect(config).toContain("https://*.cartocdn.com");
    expect(config).toContain("https://tiles.maps.eox.at");
    expect(config).toContain("https://api.ipma.pt");
  });
});
