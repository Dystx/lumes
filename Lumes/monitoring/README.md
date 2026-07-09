# Monitoring setup for lumes.pt

How to wire up external health checks so you get a ping when the
site is unreachable.

## What you're monitoring

| Endpoint | Purpose | Expected response |
| --- | --- | --- |
| `https://lumes.pt/` | Homepage liveness | 200 OK, HTML body |
| `https://lumes.pt/api/health` | Liveness + DB freshness | 200 (ok), 503 (degraded) |
| `https://lumes.pt/api/incidents` | Public data feed | 200, JSON payload |

`/api/health` is the most useful — it returns 503 within 5 minutes
of the ingest cron failing or the DB being unreachable.

## Option A — UptimeRobot (free, 5-min checks)

1. Sign up at https://uptimerobot.com (free tier covers 50 monitors).
2. Add Monitor → HTTPS:
   - Friendly name: `lumes.pt /api/health`
   - URL: `https://lumes.pt/api/health`
   - Monitoring interval: 5 minutes
   - Monitor type: HTTP(s)
   - Expected status code: `200`
   - Alert contacts: your email
3. Optionally add a second monitor on `/api/incidents` with
   keyword `incidents` (search for the JSON keyword in the body)
   so you get a separate alert if the data endpoint degrades.

## Option B — BetterStack (free for 1 monitor, paid for more)

```sh
curl -fsS -X POST https://betteruptime.com/api/v2/monitors \
  -H "Authorization: Bearer $BETTERSTACK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "monitor_check_http",
    "attributes": {
      "pronounceable_name": "lumes.pt /api/health",
      "url": "https://lumes.pt/api/health",
      "expected_status_code": 200,
      "check_interval": 60,
      "request_timeout": 10,
      "monitor_group_id": "<paste group id here>"
    }
  }'
```

Repeat for `/api/incidents` if you want.

## Option C — Healthchecks.io (only when you want cron monitoring)

Useful specifically for **monitoring the cron**, not just the web
endpoint. Catches scenarios where the box is up but the cron
itself isn't running.

1. Sign up at https://healthchecks.io (free tier: 20 monitors).
2. New Check → Name: `lumes-ingest` → Period: 1 minute → Grace: 5 min.
3. Copy the ping URL it gives you (looks like
   `https://hc-ping.com/UUID`).
4. Set the env var on the box: `echo 'CRON_PING_URL=https://hc-ping.com/UUID' >> /opt/apps/lumes/.env`
5. Edit `scripts/ingest.ts` to ping it at the end:
   ```ts
   if (process.env.CRON_PING_URL) {
     await fetch(process.env.CRON_PING_URL, { method: "POST" }).catch(() => {});
   }
   ```
   …or wrap the cron in a script:
   ```sh
   * * * * * cd /opt/apps/lumes && bun scripts/ingest.ts && curl -fsS -m5 "$CRON_PING_URL" >/dev/null
   ```
6. Healthchecks.io alerts you if the ping doesn't arrive within
   the grace window. Free tier goes a long way.

## Local script-based monitoring (off-hours only)

If you're on a limited budget or just want a quick DIY:

```sh
# Add to your laptop's cron (not the box):
*/5 * * * * curl -fsS -o /dev/null https://lumes.pt/api/health || \
  (echo "lumes.pt down at $(date)" | mail -s "lumes.pt DOWN" you@example.com)
```

Not as robust as a third-party service, but catches outages when
you're not actively looking.

## Recommendations

For a 1-week setup:

1. **UptimeRobot free** for `/api/health` (5-minute check).
2. **Healthchecks.io free** for the cron (catches timer failures
   that don't take the box down).

For longer-term operation:

- **BetterStack paid** (~$20/mo for ~10 monitors) once you have
  multiple apps on the same box and want a unified view.
- **n8n / Pipedream / GitHub Action** free automations to push
  alerts to Slack or Discord.

## What NOT to monitor

- Every API endpoint individually. You don't need 15 monitors.
  `/api/health` is enough; alert on the dashboard-level signal.
- Synthetic checks that scrape real DOM elements. That's a
  visual-regression tool's job, not an uptime check.
- The ANEPC upstream. ANEPC has their own status — if they don't
  have one, that's a problem for them to solve.

## When alerts fire

When you get an alert, the runbook (`docs/RUNBOOK.md`) is the next
step. Section 2 has the most likely root causes and the fix for
each. Bookmark it on your phone.
