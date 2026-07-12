#!/usr/bin/env bash
#
# Validate the browser-facing public assets before a Lumes deployment.
#
# Usage:
#   bash deploy/preflight-assets.sh <app-root> filesystem
#   bash deploy/preflight-assets.sh <app-root> git
#
# The filesystem mode is used by rsync/server-only deployments. The git mode
# additionally requires every asset to be tracked and clean in HEAD because
# the git deploy path pushes HEAD and the server resets to origin/main.

set -euo pipefail

ROOT="${1:-.}"
MODE="${2:-filesystem}"

if [[ "${MODE}" != "filesystem" && "${MODE}" != "git" ]]; then
  echo "unsupported preflight mode: ${MODE}" >&2
  exit 2
fi

if [[ ! -d "${ROOT}" ]]; then
  echo "deployment root does not exist: ${ROOT}" >&2
  exit 2
fi

required_assets=(
  "public/manifest.json"
  "public/logo.svg"
  "public/sw.js"
  "public/offline.html"
  "public/robots.txt"
  "public/.well-known/security.txt"
)

for asset in "${required_assets[@]}"; do
  if [[ ! -f "${ROOT}/${asset}" ]]; then
    echo "missing required public asset: ${asset}" >&2
    exit 1
  fi

  if [[ "${MODE}" == "git" ]]; then
    if ! git -C "${ROOT}" ls-files --error-unmatch "${asset}" >/dev/null 2>&1; then
      echo "required public asset is not tracked: ${asset}" >&2
      exit 1
    fi
    if ! git -C "${ROOT}" diff --quiet HEAD -- "${asset}"; then
      echo "required public asset is not committed in HEAD: ${asset}" >&2
      exit 1
    fi
  fi
done

echo "control-asset preflight passed (${MODE})"
