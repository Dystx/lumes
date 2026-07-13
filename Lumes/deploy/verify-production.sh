#!/usr/bin/env bash
#
# Read-only post-deploy verification for lumes.pt.
#
# Usage:
#   bash deploy/verify-production.sh [https://lumes.pt]
#
# The verifier performs GET requests only. It never logs response bodies,
# credentials, cookies, or environment values. HTTP is accepted only for
# loopback URLs so local standalone smoke checks remain possible.

set -euo pipefail

BASE_URL="${1:-https://lumes.pt}"
TIMEOUT_SECONDS="${LUMES_VERIFY_TIMEOUT_SECONDS:-15}"

case "${BASE_URL}" in
  https://*) ;;
  http://127.0.0.1:*|http://localhost:*) ;;
  *)
    echo "verification requires an HTTPS URL (or a loopback HTTP URL)" >&2
    exit 2
    ;;
esac

BASE_URL="${BASE_URL%/}"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/lumes-verify.XXXXXX")"
trap 'rm -rf "${TMP_DIR}"' EXIT

failures=0

header_value() {
  local header_file="$1"
  local name="$2"
  awk -v wanted="${name}" 'BEGIN { IGNORECASE = 1 }
    tolower($0) ~ "^" tolower(wanted) ":" {
      sub(/^[^:]*:[[:space:]]*/, "", $0)
      print $0
      exit
    }' "${header_file}"
}

request() {
  local path="$1"
  local body_file
  local header_file
  local status

  body_file="$(mktemp "${TMP_DIR}/body.XXXXXX")"
  header_file="$(mktemp "${TMP_DIR}/headers.XXXXXX")"

  status="$(curl -sS -L --max-time "${TIMEOUT_SECONDS}" \
    -A 'lumes-production-verifier/1.0 (+https://lumes.pt)' \
    -D "${header_file}" -o "${body_file}" -w '%{http_code}' \
    "${BASE_URL}${path}" || true)"

  LAST_BODY="${body_file}"
  LAST_HEADERS="${header_file}"
  LAST_STATUS="${status}"
}

expect_status() {
  local path="$1"
  local expected="$2"
  request "${path}"
  if [[ "${LAST_STATUS}" != "${expected}" ]]; then
    echo "FAIL ${path}: expected HTTP ${expected}, got ${LAST_STATUS:-request-error}" >&2
    failures=$((failures + 1))
  else
    echo "OK   ${path}: HTTP ${LAST_STATUS}"
  fi
}

require_cache() {
  local path="$1"
  local header_file="$2"
  local expected="$3"
  local value
  value="$(header_value "${header_file}" 'cache-control')"
  if [[ "${value}" != *"${expected}"* ]]; then
    echo "FAIL ${path}: Cache-Control does not contain ${expected}; got ${value:-missing}" >&2
    failures=$((failures + 1))
  else
    echo "OK   ${path}: Cache-Control contains ${expected}"
  fi
}

require_content_type() {
  local path="$1"
  local header_file="$2"
  local expected="$3"
  local value
  value="$(header_value "${header_file}" 'content-type')"
  if [[ "${value}" != *"${expected}"* ]]; then
    echo "FAIL ${path}: Content-Type does not contain ${expected}; got ${value:-missing}" >&2
    failures=$((failures + 1))
  else
    echo "OK   ${path}: Content-Type contains ${expected}"
  fi
}

require_json_status() {
  local path="$1"
  local body_file="$2"
  local expression="$3"
  local value
  value="$(python3 - "${body_file}" "${expression}" <<'PY'
import json
import sys

body_path, expression = sys.argv[1:]
try:
    payload = json.load(open(body_path, encoding="utf-8"))
except Exception:
    print("invalid-json")
    raise SystemExit(0)

if expression == "health":
    print(payload.get("status", "missing"))
elif expression == "source-state":
    print(payload.get("dataState", {}).get("state", "missing"))
elif expression == "source-count":
    sources = payload.get("sources")
    print(len(sources) if isinstance(sources, list) else "missing")
else:
    print("unknown-expression")
PY
  )"
  if [[ "${expression}" == "health" && "${value}" != "ok" ]]; then
    echo "FAIL ${path}: health status is ${value}" >&2
    failures=$((failures + 1))
  elif [[ "${expression}" == "source-state" && "${value}" == "retryable-error" ]]; then
    echo "FAIL ${path}: source-health is retryable-error" >&2
    failures=$((failures + 1))
  elif [[ "${expression}" == "source-count" && ! "${value}" =~ ^[0-9]+$ ]]; then
    echo "FAIL ${path}: sources array is missing" >&2
    failures=$((failures + 1))
  else
    echo "OK   ${path}: ${expression}=${value}"
  fi
}

echo "Verifying ${BASE_URL}"

expect_status / 200
root_body="${LAST_BODY}"
root_headers="${LAST_HEADERS}"
root_status="${LAST_STATUS}"
if [[ "${root_status}" == "200" ]]; then
  require_cache / "${root_headers}" "no-store"
  require_content_type / "${root_headers}" "text/html"

  python3 - "${root_body}" "${TMP_DIR}/assets.txt" <<'PY'
import re
import sys

html = open(sys.argv[1], encoding="utf-8", errors="replace").read()
assets = sorted({
    match
    for match in re.findall(r'(?:src|href)="([^"?#]+)', html)
    if match.startswith("/_next/static/") and match.endswith((".js", ".css"))
})
open(sys.argv[2], "w", encoding="utf-8").write("\n".join(assets) + ("\n" if assets else ""))
PY

  if [[ ! -s "${TMP_DIR}/assets.txt" ]]; then
    echo "FAIL /: no hashed CSS/JS asset URLs found in HTML" >&2
    failures=$((failures + 1))
  else
    while IFS= read -r asset; do
      expect_status "${asset}" 200
      asset_headers="${LAST_HEADERS}"
      asset_status="${LAST_STATUS}"
      if [[ "${asset_status}" == "200" ]]; then
        require_cache "${asset}" "${asset_headers}" "immutable"
      fi
    done < "${TMP_DIR}/assets.txt"
  fi
fi

expect_status /manifest.json 200
manifest_body="${LAST_BODY}"
manifest_headers="${LAST_HEADERS}"
manifest_status="${LAST_STATUS}"
require_cache /manifest.json "${manifest_headers}" "no-store"
require_content_type /manifest.json "${manifest_headers}" "json"

if [[ "${manifest_status}" == "200" && "$(header_value "${manifest_headers}" 'content-type')" == *"json"* ]]; then
  if ! python3 - "${manifest_body}" "${TMP_DIR}/manifest-assets.txt" <<'PY'
import json
import sys

payload = json.load(open(sys.argv[1], encoding="utf-8"))
icons = payload.get("icons", [])
assets = sorted({
    icon.get("src")
    for icon in icons
    if isinstance(icon, dict) and isinstance(icon.get("src"), str) and icon["src"].startswith("/")
})
open(sys.argv[2], "w", encoding="utf-8").write("\n".join(assets) + ("\n" if assets else ""))
PY
  then
    echo "FAIL /manifest.json: response is not valid JSON" >&2
    failures=$((failures + 1))
  elif [[ ! -s "${TMP_DIR}/manifest-assets.txt" ]]; then
    echo "FAIL /manifest.json: no absolute icon URLs found" >&2
    failures=$((failures + 1))
  else
    while IFS= read -r asset; do
      expect_status "${asset}" 200
    done < "${TMP_DIR}/manifest-assets.txt"
  fi
fi

expect_status /sw.js 200
sw_headers="${LAST_HEADERS}"
require_cache /sw.js "${sw_headers}" "no-store"
require_content_type /sw.js "${sw_headers}" "javascript"

expect_status /api/health 200
health_body="${LAST_BODY}"
require_json_status /api/health "${health_body}" health

expect_status /api/source-health 200
source_body="${LAST_BODY}"
require_json_status /api/source-health "${source_body}" source-count
require_json_status /api/source-health "${source_body}" source-state

if (( failures > 0 )); then
  echo "Verification failed: ${failures} check(s)." >&2
  exit 1
fi

echo "Verification passed."
