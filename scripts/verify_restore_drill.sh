#!/usr/bin/env bash
{ set +x; } 2>/dev/null
set -euo pipefail

umask 077

work_dir=""
active_pid=""

cleanup() {
  if [[ -n "$work_dir" && -d "$work_dir" ]]; then
    rm -rf -- "$work_dir" >/dev/null 2>&1 || true
  fi
}

fail() {
  printf '%s\n' 'restore drill verification failed.' >&2
  exit 1
}

terminate() {
  local exit_code="$1"
  trap - INT TERM
  if [[ -n "$active_pid" ]]; then
    kill -TERM "$active_pid" >/dev/null 2>&1 || true
    kill -KILL "$active_pid" >/dev/null 2>&1 || true
    wait "$active_pid" >/dev/null 2>&1 || true
    active_pid=""
  fi
  exit "$exit_code"
}

wait_for_active() {
  local child_status=0
  wait "$active_pid" || child_status="$?"
  active_pid=""
  [[ "$child_status" == "0" ]]
}

trap cleanup EXIT
trap 'terminate 130' INT
trap 'terminate 143' TERM

for required_variable in \
  RESTORE_DRILL_ISOLATED_TARGET \
  RESTORE_DRILL_WEB_URL \
  ADMIN_EMAIL \
  ADMIN_PASSWORD \
  PRODUCTION_WEB_URL \
  RESTORE_DRILL_MEDIA_FILENAME
do
  [[ -n "${!required_variable:-}" ]] || fail
done
[[ "$RESTORE_DRILL_ISOLATED_TARGET" == "confirmed" ]] || fail

if ! work_dir="$(mktemp -d "${TMPDIR:-/tmp}/senseorder-restore-drill.XXXXXX" 2>/dev/null)"; then
  fail
fi
chmod 700 "$work_dir" || fail

normalized_url_file="$work_dir/normalized-url"
curl_resolve_file="$work_dir/curl-resolve"
python3 - "$normalized_url_file" "$curl_resolve_file" >/dev/null 2>&1 <<'PY' &
import ipaddress
import os
from pathlib import Path
import re
import socket
import sys
from urllib.parse import urlsplit


def normalize_public_https_base(raw: str) -> tuple[str, str, int, bool]:
    if raw != raw.strip() or any(ord(character) < 33 for character in raw):
        raise ValueError
    parsed = urlsplit(raw)
    if (
        parsed.scheme != "https"
        or not parsed.netloc
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
        or parsed.path not in ("", "/")
    ):
        raise ValueError
    host = parsed.hostname
    if host is None or host.endswith("."):
        raise ValueError
    host = host.lower()
    try:
        port = parsed.port
    except ValueError as error:
        raise ValueError from error
    if port is not None and not 1 <= port <= 65535:
        raise ValueError

    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        if (
            "." not in host
            or host == "localhost"
            or host.endswith((".local", ".localhost", ".internal", ".home", ".lan"))
            or len(host) > 253
        ):
            raise ValueError
        labels = host.split(".")
        if any(
            not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label)
            for label in labels
        ):
            raise ValueError
        rendered_host = host
        is_literal = False
    else:
        if not address.is_global:
            raise ValueError
        rendered_host = f"[{host}]" if address.version == 6 else host
        is_literal = True

    rendered_port = "" if port in (None, 443) else f":{port}"
    return f"https://{rendered_host}{rendered_port}", host, port or 443, is_literal


target, target_host, target_port, target_is_literal = normalize_public_https_base(
    os.environ["RESTORE_DRILL_WEB_URL"]
)
production, _, _, _ = normalize_public_https_base(os.environ["PRODUCTION_WEB_URL"])
if production == target:
    raise ValueError

resolve_value = ""
if not target_is_literal:
    resolved = {
        ipaddress.ip_address(item[4][0])
        for item in socket.getaddrinfo(target_host, target_port, type=socket.SOCK_STREAM)
    }
    if not resolved or any(not address.is_global for address in resolved):
        raise ValueError
    selected = sorted(resolved, key=lambda address: (address.version, int(address)))[0]
    rendered_address = f"[{selected}]" if selected.version == 6 else str(selected)
    resolve_value = f"{target_host}:{target_port}:{rendered_address}"

filename = os.environ["RESTORE_DRILL_MEDIA_FILENAME"]
if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,239}", filename):
    raise ValueError

for output_name, value in ((sys.argv[1], target), (sys.argv[2], resolve_value)):
    output = Path(output_name)
    descriptor = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        stream.write(value)
PY
active_pid="$!"
if ! wait_for_active; then
  fail
fi
target_url="$(<"$normalized_url_file")"
curl_resolve="$(<"$curl_resolve_file")"

health_response="$work_dir/health.json"
demo_response="$work_dir/demo.json"
login_payload="$work_dir/login.json"
login_response="$work_dir/login-response.json"
cookie_jar="$work_dir/cookies"
admin_media_response="$work_dir/admin-media.json"
expected_size_file="$work_dir/expected-size"
public_media_file="$work_dir/public-media"

python3 - "$login_payload" >/dev/null 2>&1 <<'PY' &
import json
import os
import sys

descriptor = os.open(sys.argv[1], os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
    stream.write(
        json.dumps(
            {"email": os.environ["ADMIN_EMAIL"], "password": os.environ["ADMIN_PASSWORD"]},
            ensure_ascii=False,
            separators=(",", ":"),
        )
    )
PY
active_pid="$!"
if ! wait_for_active; then
  fail
fi
: >"$cookie_jar"
chmod 600 "$cookie_jar" || fail

curl_options=(
  --noproxy '*'
  --fail
  --silent
  --show-error
  --connect-timeout 5
  --max-time 30
  --proto '=https'
  --proto-redir '=https'
  --max-redirs 0
)
curl_resolve_options=()
if [[ -n "$curl_resolve" ]]; then
  curl_resolve_options=(--resolve "$curl_resolve")
fi

http_request() {
  local output_file="$1"
  shift
  local status_file="$work_dir/http-status"
  : >"$status_file"
  curl --disable \
    "${curl_options[@]}" \
    "${curl_resolve_options[@]}" \
    --output "$output_file" \
    --write-out '%{http_code}' \
    "$@" >"$status_file" 2>/dev/null &
  active_pid="$!"
  wait_for_active || return 1
  [[ "$(<"$status_file")" == "200" ]]
}

run_quiet() {
  "$@" >/dev/null 2>&1 &
  active_pid="$!"
  wait_for_active
}

if ! http_request "$health_response" "$target_url/api/health"
then
  fail
fi
python3 - "$health_response" >/dev/null 2>&1 <<'PY' &
import json
import sys

with open(sys.argv[1], encoding="utf-8") as stream:
    payload = json.load(stream)
if not isinstance(payload, dict) or payload.get("status") != "alive":
    raise ValueError
PY
active_pid="$!"
if ! wait_for_active; then
  fail
fi

if ! http_request "$demo_response" \
  --request POST \
  "$target_url/api/demo/run"
then
  fail
fi
if ! run_quiet npm --prefix web run validate:demo-response <"$demo_response"; then
  fail
fi

if ! http_request "$login_response" \
  --request POST \
  --header "Origin: $target_url" \
  --header 'Content-Type: application/json' \
  --data-binary "@$login_payload" \
  --cookie-jar "$cookie_jar" \
  "$target_url/api/admin/login"
then
  fail
fi
python3 - "$login_response" >/dev/null 2>&1 <<'PY' &
import json
import sys

with open(sys.argv[1], encoding="utf-8") as stream:
    payload = json.load(stream)
if not isinstance(payload, dict) or payload.get("ok") is not True:
    raise ValueError
PY
active_pid="$!"
if ! wait_for_active; then
  fail
fi

if ! http_request "$admin_media_response" \
  --cookie "$cookie_jar" \
  "$target_url/api/admin/media"
then
  fail
fi
python3 - "$admin_media_response" "$expected_size_file" >/dev/null 2>&1 <<'PY' &
import json
import os
import sys

with open(sys.argv[1], encoding="utf-8") as stream:
    payload = json.load(stream)
media = payload.get("media") if isinstance(payload, dict) else None
if not isinstance(media, list):
    raise ValueError
matches = [item for item in media if isinstance(item, dict) and item.get("filename") == os.environ["RESTORE_DRILL_MEDIA_FILENAME"]]
if len(matches) != 1:
    raise ValueError
size = matches[0].get("size")
if isinstance(size, bool) or not isinstance(size, int) or size <= 0:
    raise ValueError
descriptor = os.open(sys.argv[2], os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(descriptor, "w", encoding="ascii") as stream:
    stream.write(str(size))
PY
active_pid="$!"
if ! wait_for_active; then
  fail
fi

if ! http_request "$public_media_file" \
  "$target_url/api/media/$RESTORE_DRILL_MEDIA_FILENAME"
then
  fail
fi
[[ -f "$public_media_file" && ! -L "$public_media_file" && -s "$public_media_file" ]] || fail
expected_size="$(<"$expected_size_file")"
actual_size="$(wc -c <"$public_media_file" | tr -d '[:space:]')"
[[ "$actual_size" == "$expected_size" ]] || fail

printf '%s\n' 'restore drill verification passed'
