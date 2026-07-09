# Runbook — lumes.pt operational procedures

What to do when something breaks. Keep this file at hand on your
phone when a fire is on the news and you need to act fast.

> **First, calm down.** Most "site is down" reports during a
> Portuguese fire-event spike are caused by upstream services
> (ANEPC, IPMA, FIRMS, OSM) being throttled, not by your box.
> Verify before reloading anything.

---

## 0. Quick reference (top of file on purpose)

```sh
# SSH in
ssh lumes@lumes.pt

# App status
systemctl --user status lumes.service
journalctl --user -u lumes.service -n 100 --no-pager

# Ingest status
systemctl --user status lumes-ingest.timer
systemctl --user list-timers lumes-ingest.timer
journalctl --user -u lumes-ingest.service -n 20 --no-pager

# Daily DB prune (TASK G — refactor plan; daily at 04:17)
systemctl --user status lumes-prune.timer
systemctl --user list-timers lumes-prune.timer
journalctl --user -u lumes-prune.service -n 20 --no-pager
# Manual prune trigger
/usr/bin/curl -fsS "http://127.0.0.1:3001/api/cron/prune?secret=$(grep CRON_SECRET /opt/apps/lumes/.env | cut -d= -f2 | tr -d '\n')"

# Disk & backups
df -h /opt
ls -lh /opt/backups/

# Database sanity
sqlite3 /opt/apps/lumes/db/custom.db \
  'SELECT count(*) AS incidents, count(DISTINCT status) AS statuses FROM Incident;'

# Restart app (no DB loss)
systemctl --user restart lumes.service

# Restart just the cron timer (rarely needed)
systemctl --user restart lumes-ingest.timer

# Tail live logs
journalctl --user -u lumes.service -f
journalctl --user -u lumes-ingest.service -f

# DNS resolution (verify Cloudflare is in front)
dig lumes.pt +short
curl -I -H "Cache-Control: no-cache" https://lumes.pt/api/incidents | head -20
```

---

## 1. Triage flow when a problem is reported

1. **Get the symptom.** "Site is slow" / "Dashboard empty" /
   "Incidents not updating" / "Cert error". Each has a different
   root cause.
2. **Check box health** (`htop`, `df -h`, `systemctl --user status lumes`).
3. **Check upstream health.** Hit
   `https://services-eu1.arcgis.com/VlrHb7fn5ewYhX6y/arcgis/rest/services/OcorrenciasSite/FeatureServer/0/query?f=json&where=1=1&resultRecordCount=1`
   directly from the box. If it 5xx's, the upstream is the problem,
   not you.
4. **Check Cloudflare.** Log in, look at Analytics → Traffic for
   error spike. Look at Cache → Cache Rules for any recent edits.
5. **Don't restart unless restart will fix it.** A Node.js restart
   takes ~3 s and is fine. A SQLite restart of the database is
   *not* how you fix most things — restarting would lose the
   in-memory connection pool and force cold-start for the first
   ~50 users.

---

## 2. Top failure modes and how to fix them

### 2.1 ANEPC ArcGIS upstream is down

This is the most common failure. ANEPC's service degrades during
exactly the events people care about — coincidence, but inevitable.

**Symptoms:**
- `journalctl -u lumes-ingest` shows `ANEPC HTTP 503` / `ANEPC
  HTTP 502` / "fetch failed"
- Dashboard shows the "data may be stale" banner
- Homepage still serves cached content (good — that's the cache)

**Diagnosis:**
```sh
# Test upstream directly:
curl -fsS "https://services-eu1.arcgis.com/VlrHb7fn5ewYhX6y/arcgis/rest/services/OcorrenciasSite/FeatureServer/0/query?f=json&where=1%3D1&resultRecordCount=1"
```

**Fix:** Nothing to do. The cron catches `ANEPC HTTP *` errors and
the response is cached. Wait 5-15 min and the upstream usually
recovers. The homepage serves the last-known-good data via the
30 s cache + SWR pattern.

If it stays down > 1 hour:
1. Tweet / contact ANEPC's social (they sometimes acknowledge
   outages there).
2. Add a more visible "service degraded" banner to the homepage
   (search `data may be stale` in `src/components/ember-map.tsx`
   and surface it more prominently).
3. Consider falling back to FIRMS satellite-only data:
   `https://lumes.pt/api/satellite` will show VIIRS detections
   even with ANEPC down.

### 2.2 IPMA weather / fire-risk API is slow or down

IPMA's open-data APIs occasionally slow down but rarely hard-fail.

**Symptoms:**
- `/api/weather` or `/api/fire-risk` returning 502
- Map shows fire-risk overlay missing for a portion of Portugal

**Fix:** Same as ANEPC — wait, cached data continues to serve.
The `fire-risk` endpoint has a 1-hour server-side cache, so it
self-heals fast.

If persistent: log in to https://api.ipma.pt and check their
status indicator.

### 2.3 TLS certificate expired / not renewed

**Symptoms:**
- Browser shows "Your connection is not private"
- `curl -I https://lumes.pt` shows `ssl_certificate: error`

**Diagnosis:**
```sh
systemctl status caddy
journalctl -u caddy -n 50 --no-pager | grep -i "cert\|acme\|expire"
```

**Fix:**
1. Verify DNS is still pointed at the box:
   `dig lumes.pt +short` — should be the box IP.
2. Force Caddy to renew:
   ```sh
   sudo systemctl restart caddy
   ```
3. If that fails, check Caddy's ACME log:
   ```sh
   sudo journalctl -u caddy -n 100 --no-pager
   ```
   — usually a rate-limit error means DNS isn't properly pointed.

**Most likely root cause:** DNS record got changed, or you set
up a wildcard and broke the apex. Re-point DNS, wait 5 min,
restart Caddy.

### 2.4 Database (SQLite) is corrupt or lost

This is rare but high-impact. SQLite is robust against crashes
unless the disk itself dies.

**Symptoms:**
- App fails to start
- `sqlite3 /opt/apps/lumes/db/custom.db 'SELECT count(*) FROM Incident'`
  returns `Error: database disk image is malformed`

**Fix:**
```sh
# Identify latest backup
ls -lt /opt/backups/lumes.*.db | head -1

# Stop the app
sudo systemctl stop lumes.service  # system level, or
systemctl --user stop lumes.service

# Backup the corrupt file (don't delete)
sudo mv /opt/apps/lumes/db/custom.db /opt/apps/lumes/db/corrupt.$(date +%s).db
sudo chown lumes:lumes /opt/apps/lumes/db/corrupt.*.db

# Restore
sudo cp /opt/backups/lumes.YYYYMMDD.db /opt/apps/lumes/db/custom.db
sudo chown lumes:lumes /opt/apps/lumes/db/custom.db

# Verify
sqlite3 /opt/apps/lumes/db/custom.db 'PRAGMA integrity_check;'

# Restart and let cron ingest re-fill the gaps
sudo systemctl start lumes.service
```

If `PRAGMA integrity_check` reports problems, take the previous
backup instead and accept data loss of 1 day.

If all backups are corrupt: panic, post a status banner, accept
24 h data loss. (This is why §5 emphasizes off-site backups.)

### 2.5 The Node.js app has crashed (OOM or panic)

**Symptoms:**
- `systemctl --user status lumes` shows `Active: failed` or
  `Active: activating (auto-restart)`
- `journalctl -u lumes --no-pager | grep -i oom`

**Fix:**
```sh
# Look at the crash
sudo journalctl -u lumes.service -n 200 --no-pager | tail -50

# Restart manually
systemctl --user restart lumes.service

# If OOM: scale RAM or find the leak
# - Add a quick OOM-killer check:
dmesg | grep -i "killed process" | tail
# - If frequent: upgrade VPS (CX33 → CX43 / VPS 1000 → VPS 2000)
#   or reduce Node memory by lowering the cache sizes in
#   /api/incidents and /api/dashboard
```

Most OOMs trace back to a runaway cron pass or the in-process
caches accumulating unbounded. The system caches have implicit
sizes (`cache` module) but on extreme loads they can hold GBs.
If you see this often, the right answer is to upgrade the box.

### 2.6 The cron ingest isn't running

**Symptoms:**
- `/api/stats` shows `total: 6000` but `lastUpdated` is > 5 min ago
- `journalctl --user -u lumes-ingest` shows nothing for hours

**Diagnosis:**
```sh
systemctl --user status lumes-ingest.timer
systemctl --user list-timers lumes-ingest.timer
# Look for "Active: active (waiting)" — that means the timer is alive.
# Last failure / last success timestamps show whether it's firing.
```

**Fix:**
```sh
# Restart the timer
systemctl --user restart lumes-ingest.timer

# Manually run a pass to confirm the script still works
cd /opt/apps/lumes && bun scripts/ingest.ts
```

If the manual run fails: check `bun` is on PATH
(`ls /usr/local/bin/bun`), check `DATABASE_URL` in `.env`, check
the SQLite file is writable by the lumes user
(`-rw-r--r-- lumes:lumes /opt/apps/lumes/db/custom.db`).

### 2.7 Viral-event concurrency spike

**Symptoms:**
- 5xx responses from `/api/incidents`
- Top shows one or more CPUs at 100 % sustained
- `/var/log/syslog` shows SYN cookies (last-resort DoS protection)

**Diagnosis:** this is good news — your site is on the news.

**Fix (short-term):**
```sh
# Restart to reset connection counters
systemctl --user restart lumes.service

# Verify Cloudflare is absorbing most traffic:
curl -sI https://lumes.pt/api/incidents | grep cf-cache-status
# Expect: cf-cache-status: HIT (Cloudflare serving from edge)
# If DYNAMIC on every call, Cloudflare cache rules are wrong
```

**Fix (medium-term):** enable Strategy 2 from `docs/TILES.md` so
the tile-cache Worker handles map requests at the edge.

**Fix (long-term):** when you outgrow 50k concurrent, scale box
or move to multi-box with a load balancer. Not a worry for the
first viral event.

### 2.8 Out of disk

**Symptoms:**
- App fails to start with `ENOSPC`
- `df -h /opt` shows > 95 % used

**Diagnosis:**
```sh
df -h /opt
du -sh /opt/apps/* /opt/backups/* /opt/logs/
journalctl --user -u lumes-ingest | tail
```

**Fix:**
```sh
# 1. Logs usually grow fast. Truncate:
truncate -s 0 /opt/logs/lumes.log
truncate -s 0 /opt/logs/lumes.err
truncate -s 0 /opt/logs/lumes-ingest.log
truncate -s 0 /opt/logs/lumes-ingest.err
# Better fix: configure logrotate (see §3 below) if you haven't.

# 2. Old backups older than 14 d are auto-cleaned by cron, but
#    if a runaway created more:
ls -lt /opt/backups/ | head
# Manually delete the oldest:
sudo rm /opt/backups/lumes.20260601.db

# 3. If still tight: extend the disk via your provider's console
#    (Hetzner/Netcup both allow this without downtime).
```

### 2.9 Deploy went bad

**Symptoms:**
- Build errors in deploy.sh output, OR app fails to start after a
  deploy

**Fix:**
```sh
# Prefer the no-git / server-only path:
cd /opt/apps/lumes

# Option A (recommended if you have a good tree on your workstation):
# From workstation: rsync a known-good tree, then:
ssh lumes@... 'cd /opt/apps/lumes && bash deploy/deploy.sh --server'

# Option B (if .git present on server):
git log -5 --oneline
git reset --hard <previous-good-commit>
bun install --frozen-lockfile --production && bun run build
systemctl --user restart lumes.service
```

For a sticky local-only file: rebuild a fresh deploy from
scratch (rsync source tree + `bash deploy/deploy.sh --server`).

### 2.10 Lost SSH access

**Symptoms:** `ssh: Connection refused` / `Permission denied
(publickey)` / connection times out.

**Diagnosis:** which one?
- *Connection refused* → SSH daemon not running. Use the
  provider's web console serial/VNC access.
- *Permission denied (publickey)* → wrong key, or `PasswordAuthentication no`
  was set without a working key.
- *Timeout* → firewall rule dropped your IP, or the box is down
  entirely.

**Fix:**
1. Log in to the **provider's web console** (Hetzner Cloud → Server
   → Console; Netcup SCP → VNC console).
2. From the serial console, you have root.
3. Verify your SSH key is intact:
   ```sh
   cat /root/.ssh/authorized_keys
   cat /home/lumes/.ssh/authorized_keys
   ```
4. If keys are wrong, paste your pubkey from your Mac:
   ```sh
   cat > ~/.ssh/authorized_keys <<EOF
   <paste your public key here>
   EOF
   chmod 600 ~/.ssh/authorized_keys
   systemctl reload ssh
   ```
5. If the box is offline in the provider's UI: file a support
   ticket, the box may have a host-level issue.

---

## 3. Recurring operational tasks

### Daily (none — fully automated)

Already automated:
- DB backup at 04:00 (rotates 14 d)
- Logrotate (post-setup)
- Unattended security updates
- Ingest cron every 60 s

### Weekly (≈ 5 min)

```sh
ssh lumes@lumes.pt
df -h /opt       # check disk usage
journalctl --user -u lumes.service --since "7 days ago" | grep -E 'ERROR|FATAL' | head
ls -lt /opt/backups/ | head   # confirm backups are being made
sqlite3 /opt/apps/lumes/db/custom.db 'SELECT count(*) FROM Incident;'  # should be > 1000 in season
```

### Monthly (≈ 30 min)

```sh
# Update server packages
ssh lumes@lumes.pt
sudo apt-get update && sudo apt-get -y upgrade
sudo reboot   # if a kernel or libc was updated; otherwise skip

# Re-verify Caddy cert status
sudo systemctl status caddy

# Check Cloudflare Cache-Hit ratio in CF dashboard; should be > 80%

# Check your repo for any pending security updates in dependencies
cd /opt/apps/lumes
bun audit   # (or `npm audit --omit=dev`)
# If anything critical: schedule a `bash /opt/apps/lumes/deploy/deploy.sh --server` (or plain no-arg after cd)
```

### Quarterly (≈ 1 hour)

1. Review `docs/research/hosting-options-2026.md` and check if any
   assumptions have changed.
2. Update Caddy to a new version if available (often auto-updated
   via `unattended-upgrades`).
3. Audit the Cloudflare WAF — has your traffic profile changed?
4. Verify GDPR posture: privacy policy, cookie banner (if added).
5. Test disaster recovery: can you restore from a backup? Once a
   quarter, **actually do it** in a directory other than the live
   one.
6. Off-site backup check: is the B2/S3 sync still working? Pull a
   backup file down and verify it's a valid SQLite DB.

### Annually (≈ 2 hours)

1. Rotate the `CRON_SECRET` (regenerate, update `.env`, restart).
2. Rotate Cloudflare API tokens.
3. Renew domain registration (`lumes.pt` — make sure it's set to auto-renew).
4. Re-read `docs/CRON.md` and `docs/TILES.md` against the current
   state — anything you drifted from?
5. Decide: stay on the same VPS tier, upgrade, or migrate.

---

## 4. Off-site backup (recommended)

The automated backup in `setup-server.sh` writes to
`/opt/backups/lumes.YYYYMMDD.db`. **That disk is the same disk
as the box.** If the disk dies, you lose everything.

Mitigation: sync to Backblaze B2 or Cloudflare R2 nightly.

Quick recipe with R2 (Cloudflare R2 has generous free egress):

```sh
# On the box, install rclone (1 min):
curl https://rclone.org/install.sh | sudo bash

# Configure once (interactive — paste your R2 credentials):
rclone config
# Use "S3" provider; endpoint=https://<accountid>.r2.cloudflarestorage.com
# Bucket: lumes-backups

# Add to root crontab:
sudo crontab -e
# New line:
30 4 * * * rclone copy /opt/backups/ r2:lumes-backups/$(date +\%Y-\%m-\%d)/ 2>&1 | logger
```

Cost: ~$0.004/GB-month. A single 50 MB backup × 365 d ≈ 18 GB ≈
$0.07/month. Negligible.

---

## 5. What's *not* in this runbook

- **Code-level bugs** — those go in GitHub Issues and PRs.
- **New feature requests** — same.
- **Performance tuning beyond cache config** — handled in code.
- **Multi-region redundancy** — when you outgrow one box, see
  `docs/research/hosting-options-2026.md` §"What changes if the
  project becomes institutional" for the failover path. For now,
  one box + Cloudflare is enough.

---

## 6. Useful diagnostic commands

```sh
# Real-time ingest pass
cd /opt/apps/lumes && bun scripts/ingest.ts

# DB health
sqlite3 /opt/apps/lumes/db/custom.db 'PRAGMA integrity_check;'
sqlite3 /opt/apps/lumes/db/custom.db 'SELECT status, count(*) FROM Incident GROUP BY status;'
sqlite3 /opt/apps/lumes/db/custom.db 'SELECT max(lastSeen) FROM Incident;'

# Recent errors
journalctl --user -u lumes.service --since "1 hour ago" | grep -E "ERROR|FATAL|UnhandledPromiseRejection"

# Ingest history (what failed last pass)
journalctl --user -u lumes-ingest --since "1 day ago" | grep -E 'errors|persistence' | tail

# Network health to upstream
curl -fsS -o /dev/null -w "ANEPC: HTTP %{http_code} in %{time_total}s\n" \
  "https://services-eu1.arcgis.com/VlrHb7fn5ewYhX6y/arcgis/rest/services/OcorrenciasSite/FeatureServer/0/query?f=json&where=1%3D1&resultRecordCount=1"
curl -fsS -o /dev/null -w "IPMA: HTTP %{http_code} in %{time_total}s\n" \
  "https://api.ipma.pt/open-data/forecast/meteorology/rcm/rcm-d0.json"
curl -fsS -o /dev/null -w "OSM: HTTP %{http_code} in %{time_total}s\n" \
  "https://overpass-api.de/api/interpreter"

# Verify Cloudflare in front
curl -sI https://lumes.pt/api/incidents | grep -iE "(server|cf-cache|cf-ray)"
# server: cloudflare  ← good
# cf-cache-status: HIT ← good (or MISS on first hit)

# Active connections / system load
ss -s   # socket stats
uptime
free -h
```

---

## 7. Escalation

| Symptom | First person to ping |
| --- | --- |
| Box unreachable, no console access | Netcup/Hetzner support ticket |
| Cloudflare outage | https://www.cloudflarestatus.com + Twitter @Cloudflare |
| ANEPC data quality | Public ANEPC channels; no formal dev-support |
| IPMA outage | Same — observe, wait |
| Application bug | You (the operator) |

For most things, **wait 15 minutes and the upstream recovers**.
The architecture is designed to absorb upstream failures.
