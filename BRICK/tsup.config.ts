import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", cli: "src/cli.ts" },
  format: ["cjs", "esm"],
  target: "node18",
  platform: "node",
  splitting: false,
  sourcemap: true,
  dts: { entry: { index: "src/index.ts" } },
  clean: true,
  external: [
    "ts-morph",
    "typescript",
    "commander",
    "chalk",
    "globby",
    "@inquirer/prompts",
    "@inquirer/core",
    "minimatch",
  ],
  banner: { js: "#!/usr/bin/env node" },
});
