import { Command } from "commander";
import { globby } from "globby";
import { resolve, isAbsolute, join, relative } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createProject, isTextSource } from "./extractor/project.js";
import { extractComponents } from "./extractor/component.js";
import { runDetectors } from "./detectors/index.js";
import { scoreComponent, scoreProject } from "./scorer.js";
import { renderTerminal } from "./reporter/terminal.js";
import { renderJson } from "./reporter/json.js";
import { renderBadge } from "./reporter/badge.js";
import { loadConfig, saveConfig, resolveConfigPath } from "./config/loader.js";
import { runWizard, isCancelError } from "./config/wizard.js";
import { appendRun, readLastRun, renderTrend } from "./memory/log.js";
import { TokenCache } from "./tokenizer/cache.js";
import { extractDesignTokens, emptyTokens } from "./tokenizer/index.js";
import type { SlopAuditConfig, Strictness, DesignTokens } from "./types.js";

const VERSION = "0.1.0";

function collect(value: string, prev: string[]): string[] {
  return prev.concat([value]);
}

function resolveProjectPath(input?: string): string {
  const raw = input ?? process.cwd();
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
}

const program = new Command();

program
  .name("slop-audit")
  .description("Detect AI-generated frontend slop")
  .version(VERSION, "-V, --version")
  .argument("[path]", "project path", process.cwd())
  .option("--init", "run calibration wizard")
  .option(
    "--json [path]",
    "write JSON report (default: ./slop-audit-report.json; use - for stdout)"
  )
  .option("--badge", "output README badge markdown")
  .option("--ai-autopsy", "show AI failure-mode breakdown")
  .option("-q, --quiet", "suppress advice and footer links")
  .option(
    "-s, --strict",
    "exit with code 2 if any critical or high issue is found"
  )
  .option("--config <path>", "path to .slop-audit.json")
  .option("--include <glob>", "include pattern (repeatable)", collect, [])
  .option("--exclude <glob>", "exclude pattern (repeatable)", collect, [])
  .option("--strictness <level>", "brutal | balanced | gentle")
  .option("--no-increase", "fail if Slop Index increased vs. previous run")
  .option("--trend [n]", "print Sparkline of last n runs (default: 20)")
  .option("--no-cache", "disable incremental token cache")
  .option("--since <ref>", "only scan files changed since git ref")
  .action(async (projectPathArg: string, options: Record<string, unknown>) => {
    const projectPath = resolveProjectPath(projectPathArg);

    if (options.trend !== undefined) {
      const raw =
        typeof options.trend === "string" && options.trend.trim().length > 0
          ? options.trend
          : "20";
      const limit = parseInt(raw, 10);
      console.log(renderTrend(projectPath, Number.isFinite(limit) ? limit : 20));
      process.exit(0);
    }

    if (options.init) {
      try {
        const config = await runWizard();
        saveConfig(projectPath, config);
        console.log(`Generated ${join(projectPath, ".slop-audit.json")}`);
        process.exit(0);
      } catch (err) {
        if (isCancelError(err)) {
          console.log("Initialization cancelled.");
          process.exit(0);
        }
        throw err;
      }
    }

    const configPath = resolveConfigPath(
      projectPath,
      options.config as string | undefined
    );

    let config: SlopAuditConfig;
    try {
      config = loadConfig(projectPath, options.config as string | undefined);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(2);
    }

    if (options.strictness) {
      const allowed: Strictness[] = ["brutal", "balanced", "gentle"];
      if (!allowed.includes(options.strictness as Strictness)) {
        console.error(
          `Invalid --strictness: ${String(options.strictness)}. Must be one of: brutal, balanced, gentle`
        );
        process.exit(2);
      }
      config.strictness = options.strictness as Strictness;
    }
    if (Array.isArray(options.include) && options.include.length > 0) {
      config.include = options.include as string[];
    }
    if (Array.isArray(options.exclude) && options.exclude.length > 0) {
      config.exclude = options.exclude as string[];
    }

    try {
      const report = await runAudit(projectPath, config, options, configPath);

      if (options.json) {
        const json = renderJson(report);
        if (options.json === "-") {
          console.log(json);
        } else {
          const outPath =
            typeof options.json === "string" && options.json.length > 0
              ? isAbsolute(options.json)
                ? options.json
                : resolve(process.cwd(), options.json)
              : resolve(projectPath, "slop-audit-report.json");
          writeFileSync(outPath, json + "\n", "utf-8");
          if (!options.quiet) {
            console.log(`Wrote JSON report to ${outPath}`);
          }
        }
      }

      if (options.badge) {
        console.log(renderBadge(report.slopIndex));
      }

      if (!options.json && !options.badge) {
        console.log(
          renderTerminal(report, {
            quiet: options.quiet as boolean | undefined,
            aiAutopsy: options.aiAutopsy as boolean | undefined,
          })
        );
      }

      const hasCriticalOrHigh = report.topOffenses.some(
        (issue) => issue.severity === "critical" || issue.severity === "high"
      );

      const lastRun = config.projectMemory ? readLastRun(projectPath) : undefined;

      if (config.projectMemory) {
        appendRun(projectPath, report, config.categoryThresholds);
      }

      if (options.strict && hasCriticalOrHigh) {
        process.exit(2);
      }

      if (options.increase === false) {
        if (lastRun && report.slopIndex > lastRun.slopIndex) {
          console.error(
            `Slop Index increased from ${lastRun.slopIndex}% to ${report.slopIndex}%`
          );
          process.exit(2);
        }
      }

      if (report.slopIndex > 0) {
        process.exit(1);
      }
      process.exit(0);
    } catch (err) {
      console.error(
        "Scan error:",
        err instanceof Error ? err.message : String(err)
      );
      process.exit(2);
    }
  });

async function runAudit(
  projectPath: string,
  config: SlopAuditConfig,
  options: Record<string, unknown>,
  configPath?: string
) {
  const filePaths = await discoverFiles(projectPath, config, options);
  const codePaths = filePaths.filter((p) => !isTextSource(p));
  const textPaths = filePaths.filter(isTextSource);
  const project = createProject(codePaths);
  const components = extractComponents(project, textPaths);

  const cache = new TokenCache(projectPath, options.cache !== false);
  const tokens = await extractTokens(projectPath, cache);

  const componentReports = components.map((component) => {
    const issues = runDetectors(
      component.node,
      config,
      tokens,
      projectPath,
      component.file
    );
    return {
      file: component.file,
      name: component.name,
      line: component.line,
      slopIndex: scoreComponent(issues, config.strictness),
      issues,
    };
  });

  return scoreProject(componentReports, config.strictness, configPath);
}

async function discoverFiles(
  projectPath: string,
  config: SlopAuditConfig,
  options: Record<string, unknown>
): Promise<string[]> {
  let files = await globby(config.include, {
    cwd: projectPath,
    absolute: true,
    ignore: config.exclude,
    onlyFiles: true,
  });

  if (options.since) {
    files = filterSince(projectPath, files, String(options.since));
  }

  return files;
}

function filterSince(
  projectPath: string,
  files: string[],
  ref: string
): string[] {
  const result = spawnSync(
    "git",
    ["diff", "--name-only", ref, "--"],
    { cwd: projectPath, encoding: "utf-8" }
  );
  if (result.error || result.status !== 0) {
    console.warn(
      `Could not run git diff since ${ref}: ${
        result.stderr?.trim() || result.error?.message || "unknown error"
      }`
    );
    return files;
  }

  const changed = new Set(
    result.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
  );

  return files.filter((file) => {
    const rel = relative(projectPath, file);
    return changed.has(rel) || changed.has(file);
  });
}

async function extractTokens(
  projectPath: string,
  cache: TokenCache
): Promise<DesignTokens> {
  const tailwindConfigs = await globby(
    ["tailwind.config.{js,ts,mjs,cjs}"],
    {
      cwd: projectPath,
      absolute: true,
      onlyFiles: true,
      ignore: ["**/node_modules/**", "**/dist/**", "**/build/**"],
    }
  );

  const tailwindThemeCss = await discoverTailwindThemeCss(projectPath);
  const cssVars = await globby(["**/*.css"], {
    cwd: projectPath,
    absolute: true,
    onlyFiles: true,
    ignore: ["**/node_modules/**", "**/dist/**", "**/build/**"],
  });

  const opts: import("./tokenizer/index.js").TokenizerOptions = { cache };
  if (tailwindConfigs[0]) {
    opts.tailwindConfigPath = tailwindConfigs[0];
  }
  if (tailwindThemeCss) {
    opts.tailwindThemeCssPath = tailwindThemeCss;
  }
  if (cssVars[0] && !tailwindThemeCss) {
    opts.cssVarsPath = cssVars[0];
  }

  if (!opts.tailwindConfigPath && !opts.tailwindThemeCssPath && !opts.cssVarsPath) {
    return emptyTokens();
  }

  return extractDesignTokens(opts);
}

async function discoverTailwindThemeCss(
  projectPath: string
): Promise<string | undefined> {
  const candidates = await globby(["**/*.css"], {
    cwd: projectPath,
    absolute: true,
    onlyFiles: true,
    ignore: ["**/node_modules/**", "**/dist/**", "**/build/**"],
  });

  for (const file of candidates) {
    try {
      const text = readFileSync(file, "utf-8");
      if (/@theme\s*(?:inline)?\s*\{/.test(text)) {
        return file;
      }
    } catch {
      // ignore unreadable files
    }
  }

  return undefined;
}

program.parse();
