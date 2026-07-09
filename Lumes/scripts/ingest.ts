#!/usr/bin/env bun
/**
 * Standalone ingest runner.
 *
 * Invoke from system cron / systemd timer / GitHub Actions every 60 seconds:
 *
 *     * * * * * cd /opt/lumes && bun scripts/ingest.ts >> /var/log/lumes/ingest.log 2>&1
 *
 * The script exits 0 on success (even if there were upstream errors that
 * `runIngest` reported as zero-incident), 1 on an unexpected exception.
 *
 * The output is a single line of JSON — easy to parse with `jq` in a
 * monitoring pipeline.
 */

import { runIngest } from "../src/lib/ingest";

async function main() {
  const result = await runIngest();
  // Single-line JSON so log-rotation doesn't tear a record.
  process.stdout.write(JSON.stringify(result) + "\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("ingest: unexpected failure", err);
  process.exit(1);
});
