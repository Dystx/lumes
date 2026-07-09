#!/usr/bin/env bash
# Run a Lighthouse audit locally without CI. Useful for quick
# checks during development.

set -euo pipefail

echo "== Building =="
bun run build

echo "== Starting prod server in background =="
# Trap to kill the server on exit.
bun .next/standalone/server.js &
SERVER_PID=$!
trap "kill $SERVER_PID 2>/dev/null || true" EXIT

# Wait for the server to respond.
for i in $(seq 1 30); do
  sleep 1
  if curl -fsS -o /dev/null http://localhost:3000/; then
    break
  fi
done

echo "== Running Lighthouse =="
# Requires `@lhci/cli` once: bun add -D @lhci/cli
bunx lhci autorun --config=./lighthouserc.json

echo "== Done =="
