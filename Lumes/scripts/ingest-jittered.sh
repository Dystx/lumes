#!/usr/bin/env bash
#
# Cron wrapper that adds random jitter to the ingest run.
#
# Why: if you have 100 lumes.pt users all running the same cron
# pattern, every cron tick happens at second :00. Upstream
# services see a thundering herd of requests at the same
# millisecond. Adding 0-30 s of jitter smooths the load.
#
# Replace this for `bun scripts/ingest.ts` in the systemd timer:
#
#     [Service]
#     ExecStart=/opt/apps/lumes/scripts/ingest-jittered.sh
#
# OR keep both: this script for the box-level cron, and keep the
# direct `bun scripts/ingest.ts` for the HTTP `/api/cron/ingest`
# endpoint where the user controls timing.

set -euo pipefail

MAX_JITTER_S=30

# Random 0..MAX_JITTER_S
jitter=$(( (RANDOM % (MAX_JITTER_S + 1)) ))

echo "[ingest-jittered] sleeping ${jitter}s"
sleep "${jitter}"

cd "$(dirname "$0")/.."
exec bun scripts/ingest.ts
