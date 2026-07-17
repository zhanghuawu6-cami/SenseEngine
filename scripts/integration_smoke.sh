#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${SENSE_ENGINE_SERVICE_KEY:-}" ]]; then
  printf '%s\n' 'SENSE_ENGINE_SERVICE_KEY is required' >&2
  exit 1
fi

API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:8000}"
WEB_BASE_URL="${WEB_BASE_URL:-http://127.0.0.1:3000}"
PRIVATE_URL="${SENSE_ENGINE_PRIVATE_URL:-$API_BASE_URL}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

umask 077
api_unauthorized_response="$(mktemp "${TMPDIR:-/tmp}/senseengine-api-unauthorized.XXXXXX")"
api_response="$(mktemp "${TMPDIR:-/tmp}/senseengine-api-response.XXXXXX")"
web_response="$(mktemp "${TMPDIR:-/tmp}/senseorder-web-response.XXXXXX")"

cleanup() {
  rm -f "$api_unauthorized_response" "$api_response" "$web_response"
}
trap cleanup EXIT INT TERM

fail() {
  printf 'integration smoke failed: %s\n' "$1" >&2
  exit 1
}

poll_health() {
  local label="$1"
  local url="$2"
  local timeout_seconds="$3"
  local deadline=$((SECONDS + timeout_seconds))
  local status=""

  while ((SECONDS < deadline)); do
    local remaining_seconds=$((deadline - SECONDS))
    local curl_timeout=2
    if ((remaining_seconds < curl_timeout)); then
      curl_timeout="$remaining_seconds"
    fi

    status="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time "$curl_timeout" "$url" 2>/dev/null || true)"
    if [[ "$status" == "200" ]]; then
      printf '%s: 200\n' "$label"
      return 0
    fi

    remaining_seconds=$((deadline - SECONDS))
    if ((remaining_seconds > 0)); then
      sleep 1
    fi
  done

  fail "$label did not become ready"
}

post_status() {
  local output_file="$1"
  shift
  curl --silent --show-error --output "$output_file" --write-out '%{http_code}' \
    --connect-timeout 5 --max-time 30 --request POST "$@" 2>/dev/null || true
}

assert_status() {
  local label="$1"
  local actual="$2"
  local expected="$3"

  printf '%s: %s\n' "$label" "${actual:-transport-error}"
  [[ "$actual" == "$expected" ]] || fail "$label returned an unexpected status"
}

assert_response_is_public() {
  local response_file="$1"

  if grep -Fq -- "$SENSE_ENGINE_SERVICE_KEY" "$response_file"; then
    fail "response contains a forbidden sensitive value"
  fi
  if [[ -n "$PRIVATE_URL" ]] && grep -Fq -- "$PRIVATE_URL" "$response_file"; then
    fail "response contains a forbidden sensitive value"
  fi
}

cd "$ROOT_DIR"

poll_health "API readiness" "$API_BASE_URL/health/ready" 30

status="$(post_status "$api_unauthorized_response" "$API_BASE_URL/v1/demo/run")"
assert_status "API unauthorized POST" "$status" "401"

status="$(post_status "$api_response" \
  --header "X-SenseEngine-Service-Key: $SENSE_ENGINE_SERVICE_KEY" \
  "$API_BASE_URL/v1/demo/run")"
assert_status "API authorized POST" "$status" "200"
assert_response_is_public "$api_response"
npm --prefix web run validate:demo-response <"$api_response"

poll_health "Web health" "$WEB_BASE_URL/api/health" 60

status="$(post_status "$web_response" "$WEB_BASE_URL/api/demo/run")"
assert_status "Web demo POST" "$status" "200"
assert_response_is_public "$web_response"
npm --prefix web run validate:demo-response <"$web_response"

printf '%s\n' 'dual-service integration smoke passed'
