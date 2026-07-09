#!/usr/bin/env bash
#
# Deploy helper.
#
# With git remote (push + pull on server):
#   bash deploy/deploy.sh lumes@lumes.pt
#
# Pure server-only deploy (no git remote; after rsync/scp source):
#   ssh lumes@server
#   cd /opt/apps/lumes
#   bash deploy/deploy.sh
#   # (auto-detects; or use --server explicitly)
#
# The --server path does: full frozen install, Prisma generation, build
# (standalone), restart, and health check. Build tooling stays available until
# after Next.js and Prisma have completed; production pruning before build is
# not safe for this repository.
# No git operations.

set -euo pipefail

run_server_steps() {
  local SLUG="$1"
  local APP_DIR="/opt/apps/${SLUG}"

  # If already inside the target dir, stay; otherwise cd
  if [[ "$PWD" != "${APP_DIR}" && ! -f "package.json" ]]; then
    cd "${APP_DIR}" || { echo "!! Could not cd to ${APP_DIR}"; exit 1; }
  fi

  echo "==> install (build dependencies)"
  bun install --frozen-lockfile

  echo "==> prisma generate"
  bunx prisma generate

  echo "==> build"
  bun run build

  # Next's standalone server resolves /_next/static relative to its own
  # `.next` directory, but the build leaves those browser assets at the
  # project-level `.next/static`. Copy them into the runtime bundle so CSS
  # and client chunks do not 404 after the service restarts.
  echo "==> bundle browser static assets"
  mkdir -p .next/standalone/.next/static
  cp -R .next/static/. .next/standalone/.next/static/

  # Public files (including the service worker and manifest) are also outside
  # Next's standalone output. Keep them beside server.js so registrations and
  # offline assets continue to resolve after deployment.
  if [[ -d public ]]; then
    echo "==> bundle public assets"
    mkdir -p .next/standalone/public
    cp -R public/. .next/standalone/public/
  fi

  echo "==> restart service"
  systemctl --user restart "${SLUG}.service"

  echo "==> wait for service to be ready"
  for i in 1 2 3 4 5 6 7 8 9 10; do
    sleep 1
    PORT=$(grep -E '^PORT=' .env 2>/dev/null | cut -d= -f2 || echo 3001)
    if curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/api/source-health"; then
      echo "    service responding on port ${PORT}"
      return 0
    fi
  done
  echo "    !! Service did not respond within 10 s"
  journalctl --user -u "${SLUG}" -n 50 --no-pager || true
  return 1
}

if [[ "${1:-}" == "--server" ]]; then
  # Pure server direct deploy. Run from inside /opt/apps/<slug> or pass slug.
  SLUG="${2:-${SLUG:-lumes}}"
  echo "==> server-only deploy for ${SLUG} (no git)"
  run_server_steps "${SLUG}"
  echo
  echo "Deploy finished on server."
  exit 0
fi

# Auto-detect server context when no arg + already cd'ed into the prod app dir on the box.
# This makes `ssh ...; cd /opt/apps/lumes; bash deploy/deploy.sh` (and the CI trigger) work without --server.
if [[ -z "${1:-}" ]]; then
  case "$PWD" in
    /opt/apps/*|/private/*/opt/apps/*)
      SLUG="${SLUG:-$(basename "$PWD")}"
      echo "==> server context detected (no arg), running server-only mode for ${SLUG}"
      run_server_steps "${SLUG}"
      echo
      echo "Deploy finished on server."
      exit 0
      ;;
  esac
fi

# --- Client with git remote path (original behavior) ---
REMOTE="${1:-lumes@lumes.pt}"
SLUG="${SLUG:-lumes}"

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "!! No 'origin' git remote configured. Use rsync + server-only deploy instead (see docs/DEPLOY.md)."
  exit 1
fi

cat <<CMD
Deploying ${SLUG} → ${REMOTE} (git push + server pull)
CMD

git push origin main

ssh -o ServerAliveInterval=30 "${REMOTE}" bash -s -- "${SLUG}" <<'REMOTE_SCRIPT'
set -euo pipefail
SLUG="$1"
APP_DIR="/opt/apps/${SLUG}"

cd "${APP_DIR}"
echo "==> git pull"
git fetch origin && git reset --hard origin/main

# delegate to same logic
SLUG="$SLUG" bash /opt/apps/${SLUG}/deploy/deploy.sh --server "${SLUG}"
REMOTE_SCRIPT

echo
echo "Deploy finished. External check:"
ssh -o ServerAliveInterval=10 "${REMOTE}" "curl -sI https://\$(grep -E '^DOMAIN' /opt/apps/${SLUG}/.env 2>/dev/null || echo ${REMOTE#*@}) | head -5"
