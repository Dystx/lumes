#!/usr/bin/env bash
#
# Install lumes.pt (or any Next.js app) on this box. Idempotent.
#
# Usage (from an app user, not root):
#   bash install-lumes.sh <domain> <git-url> [app-slug] [port]
#   bash install-lumes.sh <domain> .          # no-remote / rsynced source
#
# Examples:
#   bash install-lumes.sh lumes.pt https://github.com/me/lumes-pt.git
#   bash install-lumes.sh lumes.pt . lumes 3001
#   bash install-lumes.sh blog.lumes.pt https://github.com/me/blog.git blog 3002
#
# The script does NOT require root. It writes systemd units into the
# user's systemd dir (~/.config/systemd/user) and uses loginctl to
# enable them. If you'd rather run as a system service, see the
# system-unit variant in deploy/lumes.service.

set -euo pipefail

# ---------- Args ----------
DOMAIN="${1:-}"
REPO="${2:-}"
SLUG="${3:-lumes}"
PORT="${4:-3001}"

if [[ -z "${DOMAIN}" ]]; then
  cat >&2 <<USAGE
usage: bash install-lumes.sh <domain> [<git-url> | .] [slug] [port]

  domain   e.g. lumes.pt or blog.lumes.pt (used for Caddy routing + TLS)
  git-url  https://github.com/.../lumes-pt.git
           Use "." or omit for no-remote / already-rsynced source in target dir
  slug     service name; default 'lumes'
  port     internal port; default 3001

USAGE
  exit 1
fi
if [[ -z "${REPO}" ]]; then
  REPO="."
fi

APPS_DIR="/opt/apps"
APP_DIR="${APPS_DIR}/${SLUG}"
BACKUP_DIR="/opt/backups"
LOG_DIR="/opt/logs"
WORKFLOW_FILE="/etc/caddy/sites-enabled/${SLUG}.caddy"

say() { printf '\n\033[1;36m== %s ==\033[0m\n' "$*"; }

# ---------- Preflight ----------
say "Validate user can write to ${APPS_DIR}"
if [[ ! -w "${APPS_DIR}" ]]; then
  echo "You ($(whoami)) cannot write to ${APPS_DIR}." >&2
  echo "Either run as the 'lumes' user or grant yourself write access." >&2
  exit 1
fi

# ---------- Clone or update (skip for local/no-remote deploys) ----------
if [[ "${REPO}" == "." || "${REPO}" == "--local" || -z "${REPO}" ]]; then
  say "Using existing source in ${APP_DIR} (no git)"
  if [[ ! -d "${APP_DIR}" ]]; then
    echo "ERROR: ${APP_DIR} does not exist. rsync/scp your source first." >&2
    exit 1
  fi
else
  say "Fetch source from ${REPO}"
  if [[ -d "${APP_DIR}" ]]; then
    ( cd "${APP_DIR}" && git fetch --all --prune && git reset --hard origin/main )
  else
    git clone --depth 1 "${REPO}" "${APP_DIR}"
  fi
fi

# ---------- DB directory ----------
say "Initialise database directory"
mkdir -p "${APP_DIR}/db"
touch "${APP_DIR}/db/.gitkeep"

# If a backup exists on the box, prefer it for first-time restore.
LATEST_BACKUP=$(ls -1t "${BACKUP_DIR}"/lumes.*.db 2>/dev/null | head -1 || true)
if [[ -n "${LATEST_BACKUP}" && ! -s "${APP_DIR}/db/custom.db" ]]; then
  echo "Restoring latest DB backup: ${LATEST_BACKUP}"
  cp "${LATEST_BACKUP}" "${APP_DIR}/db/custom.db"
fi

# ---------- Install + build ----------
say "Install dependencies and build production bundle"
( cd "${APP_DIR}" && bun install --frozen-lockfile --production && bun run build )

# ---------- Generate production .env ----------
say "Write .env (idempotent)"
ENV_FILE="${APP_DIR}/.env"
if [[ ! -f "${ENV_FILE}" ]]; then
  cat > "${ENV_FILE}" <<ENV
# Auto-generated on $(date -u +%Y-%m-%dT%H:%M:%SZ).
# Adjust DATABASE_URL if not running on the box that has the SQLite file.

DATABASE_URL=file:${APP_DIR}/db/custom.db
PORT=${PORT}
NODE_ENV=production
CRON_SECRET=$(head -c 32 /dev/urandom | xxd -p -c 32)

# Set your real FIRMS key below (https://firms.modaps.eosdis.nasa.gov/api/area/)
FIRMS_MAP_KEY=
ENV
  chmod 600 "${ENV_FILE}"
  echo "Created ${ENV_FILE}; remember to fill FIRMS_MAP_KEY before satellite feeds work."
else
  # Refresh PORT and CRON_SECRET only; do not clobber user data.
  sed -i "s|^PORT=.*|PORT=${PORT}|" "${ENV_FILE}"
fi

# ---------- Systemd user units ----------
say "Install systemd user units"
UNIT_DIR="${HOME}/.config/systemd/user"
mkdir -p "${UNIT_DIR}"

cat > "${UNIT_DIR}/${SLUG}.service" <<SERVICE
[Unit]
Description=${SLUG} Next.js standalone
After=network-online.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
ExecStart=/usr/local/bin/bun ${APP_DIR}/.next/standalone/server.js
Restart=on-failure
RestartSec=5
StandardOutput=append:${LOG_DIR}/${SLUG}.log
StandardError=append:${LOG_DIR}/${SLUG}.err
Environment=PATH=${HOME}/.bun/bin:/usr/local/bin:/usr/bin:/bin

[Install]
WantedBy=default.target
SERVICE

cat > "${UNIT_DIR}/${SLUG}-ingest.service" <<INGEST
[Unit]
Description=${SLUG} ingest pass

[Service]
Type=oneshot
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
ExecStart=/usr/local/bin/bun ${APP_DIR}/scripts/ingest.ts
StandardOutput=append:${LOG_DIR}/${SLUG}-ingest.log
StandardError=append:${LOG_DIR}/${SLUG}-ingest.err
INGEST

cat > "${UNIT_DIR}/${SLUG}-ingest.timer" <<TIMER
[Unit]
Description=Run ${SLUG} ingest every minute

[Timer]
OnBootSec=10s
OnUnitActiveSec=60s
AccuracySec=5s
Persistent=true

[Install]
WantedBy=default.target
TIMER

# Enable lingering so user services start at boot without login.
sudo loginctl enable-linger "$(whoami)" || true
systemctl --user daemon-reload
systemctl --user enable --now "${SLUG}.service" "${SLUG}-ingest.timer"

# ---------- Caddy ----------
say "Register site with Caddy"
CADDY_DIR="/etc/caddy/sites-enabled"
sudo mkdir -p "${CADDY_DIR}"
sudo tee "${CADDY_DIR}/${SLUG}.caddy" > /dev/null <<CADDY
# Auto-managed by deploy/install-lumes.sh
${DOMAIN} {
  encode zstd gzip
  reverse_proxy 127.0.0.1:${PORT}
}
CADDY

# Include all site fragments from the main Caddyfile
if ! grep -q "/etc/caddy/sites-enabled/" /etc/caddy/Caddyfile 2>/dev/null; then
  sudo tee -a /etc/caddy/Caddyfile > /dev/null <<IMPORT
# Auto-imported by deploy/install-lumes.sh
import /etc/caddy/sites-enabled/*.caddy
IMPORT
fi

sudo systemctl reload caddy || sudo systemctl restart caddy

# ---------- Verify ----------
say "Verify"
sleep 2
systemctl --user status "${SLUG}.service" --no-pager --lines 10 || true
echo
echo "Local port ${PORT}:"
curl -fsS -o /dev/null -w 'HTTP %{http_code}, %{time_total}s, %{size_download} bytes\n' "http://127.0.0.1:${PORT}/api/source-health" || echo "    (not responding yet — check journalctl -u ${SLUG})"

cat <<DONE

Installed ${SLUG} for ${DOMAIN} → http://127.0.0.1:${PORT}.

Next steps:
  - Caddy will obtain a Let's Encrypt cert automatically.
  - Verify externally:    curl -I https://${DOMAIN}
  - Follow logs:          journalctl --user -u ${SLUG} -f
  - Trigger ingest once:  systemctl --user start ${SLUG}-ingest.service
DONE
