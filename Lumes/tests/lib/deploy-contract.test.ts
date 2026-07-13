import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

describe("deployment packaging contract", () => {
  const rootWorkflowDir = join(process.cwd(), "..", ".github", "workflows");
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
    expect(script).toContain('if [[ ! -f "${SERVER_ENTRY}" ]]; then');
    expect(script).toContain('Refusing to copy assets or restart the service.');
    expect(script).toContain('readlink -f "${SERVER_ENTRY}"');
    expect(script).toContain('bash "${ASSET_PREFLIGHT}" "${PWD}" filesystem');
    expect(script).toContain('bash "${ASSET_PREFLIGHT}" "${PWD}" git');
    expect(preflightSource).toContain('public/manifest.json');
    expect(preflightSource).toContain('public/.well-known/security.txt');
    expect(spawnSync("bash", ["-n", preflight]).status).toBe(0);
    expect(script).toContain('cp -R .next/static/. "${RUNTIME_DIR}/.next/static/"');
    expect(script).toContain('cp -R public/. "${RUNTIME_DIR}/public/"');
  });

  it("materializes standalone assets and remains idempotent", () => {
    const root = mkdtempSync(join(tmpdir(), "lumes-standalone-"));
    const appRoot = join(root, ".next", "standalone", "Lumes");
    const nestedStatic = join(root, ".next", "static", "chunks", "app.js");
    const nestedPublic = join(root, "public", "manifest.json");
    const flattenScript = join(process.cwd(), "deploy", "flatten-standalone.js");

    try {
      mkdirSync(join(appRoot, ".next"), { recursive: true });
      mkdirSync(join(root, ".next", "static", "chunks"), { recursive: true });
      mkdirSync(join(root, "public"), { recursive: true });
      writeFileSync(join(appRoot, "server.js"), "module.exports = {};\n");
      writeFileSync(nestedStatic, "client chunk\n");
      writeFileSync(nestedPublic, "{\"name\":\"Lumes\"}\n");

      const first = spawnSync(process.execPath, [flattenScript], { cwd: root, encoding: "utf8" });
      expect(first.status).toBe(0);
      expect(lstatSync(join(root, ".next", "standalone", "server.js")).isSymbolicLink()).toBe(true);
      expect(readlinkSync(join(root, ".next", "standalone", "server.js"))).toBe("Lumes/server.js");
      expect(readFileSync(join(appRoot, ".next", "static", "chunks", "app.js"), "utf8")).toBe("client chunk\n");
      expect(readFileSync(join(appRoot, "public", "manifest.json"), "utf8")).toBe("{\"name\":\"Lumes\"}\n");

      const second = spawnSync(process.execPath, [flattenScript], { cwd: root, encoding: "utf8" });
      expect(second.status).toBe(0);
      expect(second.stdout).toContain("server.js already present at top level");
      expect(existsSync(join(appRoot, ".next", "static", "chunks", "app.js"))).toBe(true);
      expect(existsSync(join(appRoot, "public", "manifest.json"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("copies assets when Next emits a top-level standalone server", () => {
    const root = mkdtempSync(join(tmpdir(), "lumes-standalone-top-level-"));
    const flattenScript = join(process.cwd(), "deploy", "flatten-standalone.js");

    try {
      mkdirSync(join(root, ".next", "standalone"), { recursive: true });
      mkdirSync(join(root, ".next", "static", "chunks"), { recursive: true });
      mkdirSync(join(root, "public"), { recursive: true });
      writeFileSync(join(root, ".next", "standalone", "server.js"), "module.exports = {};\n");
      writeFileSync(join(root, ".next", "static", "chunks", "app.js"), "client chunk\n");
      writeFileSync(join(root, "public", "manifest.json"), "{\"name\":\"Lumes\"}\n");

      const result = spawnSync(process.execPath, [flattenScript], { cwd: root, encoding: "utf8" });
      expect(result.status).toBe(0);
      expect(readFileSync(join(root, ".next", "standalone", ".next", "static", "chunks", "app.js"), "utf8")).toBe("client chunk\n");
      expect(readFileSync(join(root, ".next", "standalone", "public", "manifest.json"), "utf8")).toBe("{\"name\":\"Lumes\"}\n");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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

  it("pins standalone tracing to the Lumes checkout", () => {
    const config = readFileSync("next.config.ts", "utf8");
    expect(config).toContain('import path from "node:path"');
    expect(config).toContain('outputFileTracingRoot: path.join(__dirname)');
  });

  it("pins the Bun toolchain and prepares CI's isolated database", () => {
    const packageJson = readFileSync("package.json", "utf8");
    expect(packageJson).toContain('"packageManager": "bun@1.3.4"');
    expect(packageJson).toContain('"bun": "1.3.4"');
    const ci = readFileSync(join(rootWorkflowDir, "lumes-ci.yml"), "utf8");
    expect(ci).toContain("bun-version: 1.3.4");
    expect(ci).toContain("Prepare isolated empty database");
    expect(ci).toContain("bunx prisma db push --skip-generate");
    expect(ci).toContain("working-directory: Lumes");
  });

  it("runs the root Lighthouse workflow against an isolated database", () => {
    const lighthouse = readFileSync(join(rootWorkflowDir, "lumes-lighthouse.yml"), "utf8");
    expect(lighthouse).toContain('DATABASE_URL: "file:./build-test.db"');
    expect(lighthouse).toContain("Prepare isolated empty database");
    expect(lighthouse).toContain("bun run test:perf");
    expect(lighthouse).toContain("working-directory: Lumes");
  });

  it("keeps deployment verification at the repository root", () => {
    const deploy = readFileSync(join(rootWorkflowDir, "lumes-deploy.yml"), "utf8");
    expect(deploy).toContain('uses: ./.github/workflows/lumes-ci.yml');
    expect(deploy).toContain('"Lumes/**"');
    expect(deploy).toContain('".github/workflows/lumes-deploy.yml"');
  });

  it("runs the default-off Incident Focus smoke in CI and preserves browser logs", () => {
    const packageJson = readFileSync("package.json", "utf8");
    expect(packageJson).toContain('"test:e2e:incident-focus": "LUMES_URL=${LUMES_URL:-http://localhost:3000} LUMES_3D_E2E=0 bun tests/e2e/incident-focus.test.ts"');
    expect(packageJson).toContain('"test:e2e:incident-focus:enabled": "LUMES_URL=${LUMES_URL:-http://localhost:3000} LUMES_3D_E2E=1 bun tests/e2e/incident-focus.test.ts"');
    const ci = readFileSync(join(rootWorkflowDir, "lumes-ci.yml"), "utf8");
    expect(ci).toContain("bun run test:e2e:incident-focus");
    expect(ci).toContain("Build feature-enabled Incident Focus artifact");
    expect(ci).toContain('NEXT_PUBLIC_LUMES_3D_INCIDENT_FOCUS: "1"');
    expect(ci).toContain("bun run test:e2e:incident-focus:enabled");
    expect(ci).toContain("LUMES_3D_REDUCED_MOTION=1 bun run test:e2e:incident-focus:enabled");
    expect(ci).toContain("timeout-minutes: 20");
    expect(ci).toContain("/tmp/lumes-3d-start.log");
    expect(ci).toContain("Upload browser server log on failure");
    expect(ci).toContain("/tmp/lumes-start.log");
    expect(ci).toContain("actions/upload-artifact@v4");
  });

  it("runs the reliability browser matrix against the standalone server", () => {
    const packageJson = readFileSync("package.json", "utf8");
    const ci = readFileSync(join(rootWorkflowDir, "lumes-ci.yml"), "utf8");
    const lighthouse = readFileSync("lighthouserc.json", "utf8");
    for (const script of [
      '"test:e2e:map-style":',
      '"test:e2e:data-trust":',
      '"test:e2e:following":',
      '"test:e2e:history":',
      '"test:e2e:ownership":',
      '"test:e2e:mobile-refresh":',
    ]) {
      expect(packageJson).toContain(script);
    }
    for (const suite of [
      "bun run test:e2e:map-style",
      "bun run test:e2e:data-trust",
      "bun run test:e2e:following",
      "bun run test:e2e:history",
      "bun run test:e2e:ownership",
      "bun run test:e2e:mobile-refresh",
    ]) {
      expect(ci).toContain(suite);
    }
    expect(ci).toContain("LUMES_E2E_SEED=1 bun scripts/seed-e2e-db.ts");
    expect(ci).toContain("bun .next/standalone/server.js");
    expect(lighthouse).toContain('"startServerCommand": "PORT=3001 bun .next/standalone/server.js"');
  });

  it("keeps the browser security contract explicit for map providers", () => {
    const config = readFileSync("next.config.ts", "utf8");
    expect(config).toContain("frame-ancestors 'none'");
    expect(config).toContain("https://*.cartocdn.com");
    expect(config).toContain("https://tiles.maps.eox.at");
    expect(config).toContain("https://api.ipma.pt");
  });
});
