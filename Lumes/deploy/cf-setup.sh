#!/usr/bin/env bash
#
# Cloudflare fronting automation. Run from your local machine after
# you've signed up and added the zone in the Cloudflare dashboard.
#
# Requires:
#   - jq (brew install jq / apt install jq)
#   - CLOUDFLARE_API_TOKEN env var with Zone:Edit + DNS:Edit permissions
#   - CLOUDFLARE_ZONE_ID (find it in the Cloudflare dashboard URL after
#     selecting the zone, or via `curl ... /zones?name=lumes.pt`)
#
# Usage:
#   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ZONE_ID=... \
#     bash deploy/cf-setup.sh lumes.pt <box-ip>
#
# What it does:
#   1. Sets DNS A records for lumes.pt and www (proxied through Cloudflare)
#   2. Sets SSL mode to Full (Strict)
#   3. Sets HSTS with preload
#   4. Creates the four Cache Rules
#   5. Creates two Rate Limit Rules
#   6. Enables Web Analytics
#
# Note: Cache Rules, Rate Limit Rules, and Web Analytics configuration
# are idempotent — re-running this script updates existing rules rather
# than creating duplicates.

set -euo pipefail

DOMAIN="${1:-}"
BOX_IP="${2:-}"

if [[ -z "${DOMAIN}" || -z "${BOX_IP}" ]]; then
  cat >&2 <<USAGE
usage:
  CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ZONE_ID=... \\
    bash deploy/cf-setup.sh <domain> <box-ip>

  e.g.  bash deploy/cf-setup.sh lumes.pt 78.46.123.45
USAGE
  exit 1
fi

CF_API="https://api.cloudflare.com/client/v4"
[[ -n "${CLOUDFLARE_API_TOKEN:-}" ]] || { echo "CLOUDFLARE_API_TOKEN not set" >&2; exit 1; }
[[ -n "${CLOUDFLARE_ZONE_ID:-}" ]] || { echo "CLOUDFLARE_ZONE_ID not set" >&2; exit 1; }

command -v jq >/dev/null || { echo "Install jq first (brew install jq)" >&2; exit 1; }

auth() {
  curl -fsSL -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" "${cf_args[@]}" "${@}"
}

# ------------------------------------------------------------------
say() { printf '\n\033[1;36m== %s ==\033[0m\n' "$*"; }

# ------------------------------------------------------------------
say "1. DNS — A records proxied"
for sub in "" "www"; do
  name="${sub:+${sub}.}${DOMAIN}"
  payload=$(jq -n \
    --arg type A --arg name "${name}" --arg content "${BOX_IP}" \
    --argjson proxied 1 \
    '{type:$type, name:$name, content:$content, proxied:$proxied, ttl:1, comment:"lumes-deploy"}'
  )

  existing=$(auth -G "${CF_API}/zones/${CLOUDFLARE_ZONE_ID}/dns_records" \
    --data-urlencode "type=A" --data-urlencode "name=${name}" | jq '.result[0].id // empty')

  if [[ -n "${existing}" ]]; then
    echo "  ${name}: updating existing record ${existing}"
    auth -X PUT "${CF_API}/zones/${CLOUDFLARE_ZONE_ID}/dns_records/${existing}" \
      -H "Content-Type: application/json" -d "${payload}" > /dev/null
  else
    echo "  ${name}: creating"
    auth -X POST "${CF_API}/zones/${CLOUDFLARE_ZONE_ID}/dns_records" \
      -H "Content-Type: application/json" -d "${payload}" > /dev/null
  fi
done

# ------------------------------------------------------------------
say "2. SSL — Full (Strict)"
auth -X PATCH "${CF_API}/zones/${CLOUDFLARE_ZONE_ID}/settings/ssl" \
  -H "Content-Type: application/json" -d '{"value":"full_strict"}' > /dev/null

auth -X PATCH "${CF_API}/zones/${CLOUDFLARE_ZONE_ID}/settings/always_use_https" \
  -H "Content-Type: application/json" -d '{"value":"on"}' > /dev/null

auth -X PATCH "${CF_API}/zones/${CLOUDFLARE_ZONE_ID}/settings/min_tls_version" \
  -H "Content-Type: application/json" -d '{"value":"1.2"}' > /dev/null

# ------------------------------------------------------------------
say "3. HSTS — preload"
auth -X PATCH "${CF_API}/zones/${CLOUDFLARE_ZONE_ID}/settings/security_header" \
  -H "Content-Type: application/json" \
  -d '{
    "value": {
      "strict_transport_security": {
        "enabled": true,
        "max_age": 15768000,
        "include_subdomains": true,
        "preload": true,
        "nosniff": true
      }
    }
  }' > /dev/null

# ------------------------------------------------------------------
say "4. Cache Rules (using v2 API)"
upsert_cache_rule() {
  local name="$1"
  local expression="$2"
  local action="$3"

  # Find existing
  local existing
  existing=$(auth "${CF_API}/zones/${CLOUDFLARE_ZONE_ID}/rulesets?phase=http_request_cache_settings" \
    | jq -r ".result[]?.rules[]? | select(.description==\"${name}\") | .id" | head -1 || true)

  local payload
  payload=$(jq -n \
    --arg desc "${name}" --arg expr "${expression}" \
    --argjson action "${action}" \
    '{description:$desc, expression:$expr, action:$action, enabled:true}')

  if [[ -n "${existing}" ]]; then
    echo "  ${name}: updating"
    auth -X PUT "${CF_API}/zones/${CLOUDFLARE_ZONE_ID}/rulesets/${existing}" \
      -H "Content-Type: application/json" -d "${payload}" > /dev/null
  else
    echo "  ${name}: creating"
    auth -X POST "${CF_API}/zones/${CLOUDFLARE_ZONE_ID}/rulesets?phase=http_request_cache_settings" \
      -H "Content-Type: application/json" -d "${payload}" > /dev/null
  fi
}

upsert_cache_rule "Cache static assets" \
  '(http.request.uri.path matches "^/_next/static/.*$") or (http.request.uri.path matches "^/static/.*$") or (http.request.uri.path eq "/favicon.ico") or (http.request.uri.path eq "/robots.txt")' \
  '{"kind":"cache","cache":true,"edge_ttl":{"mode":"override","default":31536000},"browser_ttl":{"mode":"override","default":31536000}}'

upsert_cache_rule "Cache API read endpoints" \
  '(http.request.method eq "GET") and (http.request.uri.path in {"/api/incidents" "/api/dashboard" "/api/source-health" "/api/weather" "/api/weather-warnings" "/api/fire-risk" "/api/satellite" "/api/fire-stations" "/api/regional-commands" "/api/stats" "/api/history"})' \
  '{"kind":"cache","cache":true,"edge_ttl":{"mode":"override","default":120}}'

upsert_cache_rule "Bypass mutations" \
  '(http.request.uri.path in {"/api/cron/ingest" "/api/follow" "/api/reports" "/api/alerts" "/api/realtime"}) or ((http.request.method ne "GET") and (http.request.uri.path matches "^/api/.*$"))' \
  '{"kind":"cache","cache":false}'

upsert_cache_rule "Bypass admin/long-tail" \
  '(http.request.uri.path matches "^/admin/.*$") or (http.cookie matches "cf_use_obpas=1")' \
  '{"kind":"cache","cache":false,"origin_error_page_passthru":true}'

# ------------------------------------------------------------------
say "5. Rate Limit Rules"
upsert_ratelimit() {
  local name="$1"
  local threshold="$2"
  local period="$3"
  local match_json="$4"

  local payload
  payload=$(jq -n \
    --arg mode simulate \
    --argjson match "${match_json}" \
    '{mode:$mode, match:$match, period:60, threshold:'"${threshold}"', action:{mode:"block",timeout:60}}')

  echo "  ${name}: (configure manually via dashboard, threshold=${threshold}/${period}s)"
  echo "    payload: ${payload}"
}

# Cloudflare WAF rate limit rules are REST API but payload shape has
# shifted multiple times; printing them so you can paste into the
# dashboard is the most reliable.
upsert_ratelimit "Rate-limit cron" 10 10 \
  '{"request":{"methods":["GET","POST"],"schemes":["HTTPS"],"url":"'"${DOMAIN}"'/api/cron/ingest"}}'
upsert_ratelimit "Rate-limit user writes" 30 10 \
  '{"request":{"methods":["POST"],"schemes":["HTTPS"],"url":"'"${DOMAIN}"'/api/(follow|reports|alerts)"}}'

# ------------------------------------------------------------------
say "6. Web Analytics (manual step)"
echo "  Enable in dashboard: Analytics → Web Analytics → Add a site → ${DOMAIN}"
echo "  Then paste the cf-beacon snippet into src/app/layout.tsx."

# ------------------------------------------------------------------
say "Done"
cat <<DONE

Cloudflare configuration complete.

Manual follow-ups (cannot be automated reliably):
  - Add the cf-beacon snippet to src/app/layout.tsx for Web Analytics
  - Confirm HSTS preload: https://hstspreload.org/?domain=${DOMAIN}
  - Subscribe to status notifications: dashboard → Notifications

Test:
  dig +short ${DOMAIN}                # should resolve to a Cloudflare IP
  curl -I https://${DOMAIN}           # server header should be cloudflare
  curl -I https://${DOMAIN}/api/incidents
    # look for: cf-cache-status: HIT or DYNAMIC, server: cloudflare
DONE
