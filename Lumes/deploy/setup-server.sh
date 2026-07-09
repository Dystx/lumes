#!/usr/bin/env bash
#
# First-time VPS setup. Run as root on a fresh Ubuntu 22.04 or 24.04 box.
# Tested on Hetzner CX33 (x86) and Netcup VPS 1000 G12 (x86); should
# work on any KVM VPS with ≥ 4 vCPU / 8 GB RAM.
#
#   ssh root@<box-ip> 'bash -s' < deploy/setup-server.sh
#
# After running, you should:
#   1. Pull your SSH key into the new `lumes` user's authorized_keys
#   2. Push your repo somewhere the box can pull from (private GitHub
#      or any private git host)
#   3. Run install-lumes.sh from /tmp/install-lumes.sh <domain> <git-url>

set -euo pipefail

# ---------- Configuration ----------
APP_USER="lumes"
APP_HOME="/home/${APP_USER}"
APPS_DIR="/opt/apps"
BACKUP_DIR="/opt/backups"
LOG_DIR="/opt/logs"
HETZNER_FQDN_IP_FILE="/root/.lumes_box_ip"

export DEBIAN_FRONTEND=noninteractive

# ---------- Helpers ----------
say() { printf '\n\033[1;36m== %s ==\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m!! %s\033[0m\n' "$*" >&2; exit 1; }

# ---------- Sanity ----------
[[ $EUID -eq 0 ]] || die "Run as root (use: ssh root@<box-ip> 'bash -s' < setup-server.sh)"

say "Update package index and apply security patches"
apt-get update -y
apt-get -y upgrade
apt-get -y install unattended-upgrades

# ---------- Core packages ----------
say "Install runtime + tooling"
apt-get -y install --no-install-recommends \
  ca-certificates curl wget rsync git jq sqlite3 logrotate \
  build-essential python3-pip \
  ufw fail2ban

# Node 22 LTS via NodeSource (Ubuntu 24.04 ships Node 20 by default)
say "Install Node 22 LTS"
if ! command -v node >/dev/null || [[ "$(node --version 2>/dev/null)" != v22* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get -y install nodejs
fi
node --version

# Bun
say "Install Bun"
if ! command -v bun >/dev/null; then
  curl -fsSL https://bun.sh/install | bash
  # Symlink for root and the app user
  install -m 0755 /root/.bun/bin/bun /usr/local/bin/bun
fi
bun --version

# Caddy (stable release via official repo)
say "Install Caddy"
if ! command -v caddy >/dev/null; then
  apt-get -y install --no-install-recommends debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/gpg.key" \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/deb/debian.deb.txt" \
    | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get -y install caddy
fi
systemctl enable caddy

# ---------- App user ----------
say "Create unprivileged user '${APP_USER}'"
if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  useradd --system --create-home --shell /bin/bash \
    --home-dir "${APP_HOME}" \
    --groups sudo \
    "${APP_USER}"
  # No password: SSH-key-only
  passwd -d "${APP_USER}" >/dev/null
  mkdir -p "${APP_HOME}/.ssh"
  chmod 700 "${APP_HOME}/.ssh"
fi
# Add the deploying user's key (taken from root's authorized_keys)
if [[ -f /root/.ssh/authorized_keys ]]; then
  cat /root/.ssh/authorized_keys >> "${APP_HOME}/.ssh/authorized_keys"
  chmod 600 "${APP_HOME}/.ssh/authorized_keys"
  chown -R "${APP_USER}:${APP_USER}" "${APP_HOME}/.ssh"
fi

# App user can sudo to restart lumes systemd services without password.
say "Wire passwordless sudo for service management"
cat > "/etc/sudoers.d/${APP_USER}" <<SUDO
${APP_USER} ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart lumes*, /usr/bin/systemctl status lumes*, /usr/bin/journalctl *
SUDO
chmod 440 "/etc/sudoers.d/${APP_USER}"

# ---------- Working directories ----------
say "Set up shared directories"
mkdir -p "${APPS_DIR}" "${BACKUP_DIR}" "${LOG_DIR}"
chown -R "${APP_USER}:${APP_USER}" "${APPS_DIR}" "${BACKUP_DIR}" "${LOG_DIR}"
chmod 755 "${APPS_DIR}" "${BACKUP_DIR}" "${LOG_DIR}"

# ---------- Backups ----------
say "Install daily SQLite backup cron"
cat > /etc/cron.d/lumes-backup <<BACKUP
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
0 4 * * * ${APP_USER} /usr/bin/sqlite3 ${APPS_DIR}/lumes/db/custom.db ".backup ${BACKUP_DIR}/lumes.\$(date +\\%Y\\%m\\%d).db" && find ${BACKUP_DIR} -type f -name 'lumes.*.db' -mtime +14 -delete
BACKUP
chmod 644 /etc/cron.d/lumes-backup

# ---------- Firewall ----------
say "Configure firewall (UFW)"
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp     # SSH
ufw allow 80/tcp     # HTTP (Caddy → Let's Encrypt http-01 challenge)
ufw allow 443/tcp    # HTTPS
# Comment out the next two if you want to expose non-HTTP ports directly
# ufw allow 3001/tcp comment 'lumes'
# ufw allow 3002/tcp comment 'blog'
ufw --force enable
systemctl enable ufw

# ---------- SSH hardening ----------
say "Tighten SSH config"
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.backup
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?PermitEmptyPasswords.*/PermitEmptyPasswords no/' /etc/ssh/sshd_config
sshd -t
systemctl reload ssh

# ---------- Auto-updates ----------
say "Enable unattended security upgrades"
dpkg-reconfigure -plow unattended-upgrades

# ---------- Save public IP for later ----------
say "Record this box's public IP"
PUBLIC_IP=$(curl -fsSL https://ifconfig.me 2>/dev/null || echo unknown)
echo "${PUBLIC_IP}" > "${HETZNER_FQDN_IP_FILE}"
echo "Box public IP: ${PUBLIC_IP}"

say "Done"
cat <<DONE

Setup complete.

Next steps:
  1. SSH into the new app user from your local machine:
       ssh ${APP_USER}@${PUBLIC_IP}
  2. Get source on the server:
       - Git path: scp deploy/install-lumes.sh ... && bash /tmp/install-lumes.sh <domain> <git-url>
       - No-git path: rsync your tree to /opt/apps/lumes/ then run the build steps
         (see docs/DEPLOY.md §4 and §6 "pure server-only")

Or see docs/DEPLOY.md for the guided walkthrough (both git and no-remote flows).
DONE
