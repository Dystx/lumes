# Deploying lumes.pt to Netcup VPS G12

Companion to [`docs/DEPLOY.md`](./DEPLOY.md). Covers the
Netcup-specific ordering flow and the one authentication quirk
that catches anyone used to Hetzner's SSH-key-during-create UX.
Everything else (Caddy, systemd, cron, Cloudflare) is identical.

## 0. Pick the SKU

| Tier | vCPU | RAM | NVMe | Price | Decision |
| --- | ---: | ---: | ---: | ---: | --- |
| VPS 500 G12 | 2 | 4 GB | 128 GB | ~€5/mo | insufficient for viral-event headroom |
| **VPS 1000 G12** | **4** | **8 GB** | **256 GB** | **~€8-9/mo** | **← pick this** |
| VPS 2000 G12 | 8 | 16 GB | 512 GB | ~€15/mo | only for > 50 k concurrent |
| VPS 4000 G12 | 12 | 32 GB | 1 TB | ~€30/mo | institutional / multi-app farm |
| VPS 8000 G12 | 16 | 64 GB | 2 TB | ~€60/mo | only if you actually need it |

DDR5 ECC memory across the line, 1 Gbit/s or 2.5 Gbit/s networking
depending on datacenter.

## 1. Datacenter selection

For lumes.pt's user base (Portugal), pick in this order:

1. **Vienna, Austria (AT)** — best Vienna-jurisdiction GDPR story;
   ~30-40 ms from Lisbon. Netcup's newest facility.
2. **Nuremberg, Germany (DE)** — same latency, German jurisdiction.
3. **Amsterdam, Netherlands (NL)** — same latency, Dutch jurisdiction;
   good if you'll also serve Benelux traffic.

Avoid for lumes.pt:
- **Manassas (US)** — ~100 ms from Lisbon, GDPR-awkward
- **Singapore (SG)** — ~250 ms from Lisbon

## 2. Order the box

1. Sign up at https://www.netcup.eu (or use the .com / .de mirror).
   - Activation usually takes 5-15 minutes after you confirm email.
   - You'll need ID verification for the first order (it's a one-time
     thing — Netcup asks for an ID photo + a selfie. Takes hours, not
     days).

2. In the **Server Control Panel** (SCP), click **Order → vServer**.

3. Choose:
   - Product: **VPS 1000 G12**
   - Location: **Vienna** (or whichever, per §1)
   - Operating system: **Ubuntu 24.04 LTS (minimal)** — pick "minimal",
     not "Nextcloud / WordPress" — those have bloat installed
   - Add-ons: skip everything (no monitoring upsell, no managed support)
   - Order length: monthly, cancel anytime. Annual saves ~15 % if
     you're confident.

4. Pay (credit card, PayPal, SEPA, or bank transfer). Order enters
   queue.

5. **Activation email** arrives within 5-15 minutes with:
   - Server's public IPv4 (e.g. `188.68.x.x`)
   - Server's public IPv6
   - **Initial root password** (single-use)
   - URL of Netcup's Server Control Panel

The IPv4 is what you'll use for everything below.

## 3. First login (password, then SSH key)

Unlike Hetzner, Netcup does not let you paste an SSH key during order.
The flow is **password first, SSH key second**.

```sh
# From your Mac — first SSH (will prompt for the password from the email)
ssh root@<ipv4-from-email>
# Paste the password. Linux refuses to display it. That's fine.
```

On the box, immediately install your SSH key and disable password auth:

```sh
# As root on the server:
mkdir -p ~/.ssh
chmod 700 ~/.ssh
# Paste your public key content (one line):
echo "ssh-ed25519 AAAA...your-key... lumes-deploy" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

# Disable password auth + root password login
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
sshd -t && systemctl reload ssh
```

From a second terminal, verify the SSH key works (don't close the
password session until confirmed):

```sh
ssh root@<ipv4> 'echo "key auth works"'
```

If it works, you're done with the password dance forever.

## 4. Pointer your domain (do this BEFORE running setup)

In your DNS provider (Cloudflare, OVH, etc.):

- `lumes.pt` → `A` record → `<ipv4>`
- `www.lumes.pt` → `CNAME` → `lumes.pt`

DNS propagation usually completes within minutes. Caddy on the box
will use Let's Encrypt's http-01 challenge, which means the domain
**must already point at the box IP** when `install-lumes.sh` runs.

## 5. Run the bootstrap

```sh
# From your Mac, push the repo somewhere Netcup can pull from:
gh repo create lumes-pt --private --source=. --remote=origin --push
# (or use any private git host)

# SSH into the box as root
ssh root@<ipv4>
```

On the box:

```sh
# Option A: pull setup script from your git remote
curl -fsSL https://raw.githubusercontent.com/<you>/lumes-pt/main/deploy/setup-server.sh -o /tmp/setup.sh
# Option B: scp from your Mac first
#   scp deploy/setup-server.sh root@<ipv4>:/tmp/

bash /tmp/setup.sh
```

The script installs Node 22, Bun, Caddy, SQLite, sets up the `lumes`
user, configures UFW, and writes the daily backup cron. ~3 minutes.

After it finishes, reconnect as the `lumes` user:

```sh
exit  # from root session
ssh lumes@<ipv4>
```

## 6. Install lumes.pt

```sh
# From your Mac, copy the install script:
scp deploy/install-lumes.sh lumes@<ipv4>:/tmp/

# On the box:
ssh lumes@<ipv4>
bash /tmp/install-lumes.sh lumes.pt https://github.com/<you>/lumes-pt.git
```

Wait ~3-5 minutes. The script:
- Clones the repo
- Builds the Next.js production bundle
- Generates a `.env` (you'll fill in `FIRMS_MAP_KEY` after)
- Installs systemd user units: `lumes.service`, `lumes-ingest.timer`
- Sets up Caddy routing for `lumes.pt` → port 3001
- Reloads Caddy (which obtains the Let's Encrypt cert)

Check the result:

```sh
systemctl --user status lumes
journalctl --user -u lumes -f
curl -I https://lumes.pt
```

Expected: `200 OK`, `server: Caddy`, valid cert.

## 7. Restore the SQLite database

The fresh install creates an empty `db/custom.db`. To copy your
6,000-incident dataset from your Mac:

```sh
# From your Mac (the local SQLite file is at db/custom.db):
scp db/custom.db lumes@<ipv4>:/opt/apps/lumes/db/custom.db

# On the box, fix ownership and trigger an initial ingest:
ssh lumes@<ipv4>
sudo chown lumes:lumes /opt/apps/lumes/db/custom.db
sudo systemctl restart lumes.service
```

Or, instead of copying the file, just let the cron ingest repopulate
from scratch — first run takes ~30 s, then the DB has the freshest
ANEPC data within 60 s.

## 8. Cloudflare (optional but recommended)

After the box is up and `https://lumes.pt` works through Caddy,
follow `docs/CLOUDFLARE.md` to put Cloudflare in front. The same
setup script (`deploy/cf-setup.sh`) works on a Netcup-hosted site
without modification:

```sh
# From your Mac:
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ZONE_ID=... \
  bash deploy/cf-setup.sh lumes.pt <ipv4>
```

## 9. Netcup-specific gotchas (all of which the deploy scripts handle)

These are things Netcup-specific that don't trip up Hetzner users.
None of them break a Hetzner-style deployment; they're just
specific to Netcup.

| Gotcha | Effect | What we do about it |
| --- | --- | --- |
| Initial auth is password-only | Can't paste SSH key during order | `setup-server.sh`'s instructions cover it (§3 above) |
| No first-boot cloud-init customization in the order UI | Server starts in default image state | `setup-server.sh` configures everything post-boot |
| IPv6 may not be on the public interface by default | Some VPS images need `ip -6 addr` enabled | Verify with `ip -6 addr` after install — usually fine, document if not |
| `/etc/cron.d/lumes-backup` writes to `/opt/backups` | Verify `df -h /opt` shows it's on the root NVMe (it will be on VPS G12) | Documented in DEPLOY.md §7 |
| Reverse DNS via support ticket only | Won't affect lumes.pt today; relevant for future SMTP | Flagged in TENANT-NOTES section, no action |
| Server Control Panel (SCP) UI is dated | Cosmetic only | Nothing to do, deploys via SSH |
| Web panel sometimes slow during incidents | Use SSH for everything; SCP is just for billing/order | Documented |

## 10. What this guide does not cover

- **Netcup Webhosting / shared hosting**: irrelevant for lumes.pt.
- **Netcup's "Root Server" line (AX/DX/RX)**: bigger dedicated
  hardware; not needed for lumes.pt's profile. The decision matrix
  is the same as for the CX33-vs-larger-Hetzner comparison.
- **Netcup API automation**: the SCP doesn't expose a sane REST API
  for ordering. The flow is manual. Fine — you order once.

## 11. Cost (post-Cloudflare)

| Item | €/mo |
| --- | ---: |
| Netcup VPS 1000 G12, Vienna, monthly | **~€8.50** (annual: ~€7.30) |
| Cloudflare Free | 0 |
| Workers Free (≤ 100 k req/day) | 0 |
| R2 Free (≤ 10 GB) | 0 |
| Domain (already have lumes.pt) | 0 |
| **Total** | **~€8.50/mo** |

At traffic that fits within the free tiers (which is what lumes.pt
will see at baseline), this is the full cost. Pay-as-you-grow
beyond that.
