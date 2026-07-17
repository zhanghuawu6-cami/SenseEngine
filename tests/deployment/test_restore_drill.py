from __future__ import annotations

import json
import os
import signal
import stat
import subprocess
import time
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "verify_restore_drill.sh"
FIXTURE = ROOT / "contracts" / "demo-response.json"
TARGET_URL = "https://restore-drill.example.com"
MEDIA_FILENAME = "restored-asset.png"
MEDIA_CONTENT = b"restored-media-content"
PASSWORD = 'p@ss "quoted" \\ slash\nline two & $HOME'


def _write_executable(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IXUSR)


def _fake_environment(tmp_path: Path) -> dict[str, str]:
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    curl_script = f'''#!/usr/bin/env python3
import json
import os
from pathlib import Path
import stat
import signal
import sys
import time

args = sys.argv[1:]
with Path(os.environ["FAKE_CURL_ARGS_LOG"]).open("a", encoding="utf-8") as stream:
    stream.write(json.dumps(args) + "\\n")

output = None
cookie_jar = None
cookie = None
data_binary = None
method = "GET"
url = None
headers = []
write_out = None
noproxy = None
i = 0
while i < len(args):
    arg = args[i]
    if arg in ("--output", "--cookie-jar", "--cookie", "--data-binary",
               "--request", "--header", "--connect-timeout", "--max-time",
               "--proto", "--proto-redir", "--max-redirs", "--resolve",
               "--write-out", "--noproxy"):
        if i + 1 >= len(args):
            sys.exit(80)
        value = args[i + 1]
        if arg == "--output": output = value
        elif arg == "--cookie-jar": cookie_jar = value
        elif arg == "--cookie": cookie = value
        elif arg == "--data-binary": data_binary = value
        elif arg == "--request": method = value
        elif arg == "--header": headers.append(value)
        elif arg == "--write-out": write_out = value
        elif arg == "--noproxy": noproxy = value
        i += 2
    elif arg in ("--disable", "--fail", "--silent", "--show-error"):
        i += 1
    elif arg.startswith("https://"):
        url = arg
        i += 1
    else:
        sys.exit(81)

if url is None or output is None or "--location" in args or "-L" in args:
    sys.exit(82)
if (os.environ.get("HTTPS_PROXY") or os.environ.get("ALL_PROXY")) and noproxy != "*":
    sys.exit(89)
base = os.environ["RESTORE_DRILL_WEB_URL"].rstrip("/")
if url == base + "/api/health":
    stage = "health"
    body = b'{{"status":"alive"}}'
elif url == base + "/api/demo/run":
    stage = "demo"
    if method != "POST" or data_binary is not None:
        sys.exit(83)
    body = Path(os.environ["FAKE_DEMO_RESPONSE"]).read_bytes()
elif url == base + "/api/admin/login":
    stage = "login"
    if (method != "POST" or data_binary is None or not data_binary.startswith("@")
            or "Origin: " + base not in headers
            or "Content-Type: application/json" not in headers):
        sys.exit(84)
    login_path = Path(data_binary[1:])
    payload = json.loads(login_path.read_text(encoding="utf-8"))
    expected = {{"email": os.environ["ADMIN_EMAIL"], "password": os.environ["ADMIN_PASSWORD"]}}
    if payload != expected:
        sys.exit(85)
    Path(os.environ["FAKE_LOGIN_CAPTURE"]).write_text(
        json.dumps(payload), encoding="utf-8"
    )
    parent_mode = stat.S_IMODE(login_path.parent.stat().st_mode)
    file_mode = stat.S_IMODE(login_path.stat().st_mode)
    with Path(os.environ["FAKE_TEMP_LOG"]).open("a", encoding="utf-8") as stream:
        stream.write(json.dumps({{"kind": "login", "path": str(login_path), "mode": file_mode,
                                 "parent": str(login_path.parent),
                                 "parent_mode": parent_mode}}) + "\\n")
    if cookie_jar is None:
        sys.exit(86)
    cookie_path = Path(cookie_jar)
    cookie_path.write_text("private-cookie", encoding="utf-8")
    with Path(os.environ["FAKE_TEMP_LOG"]).open("a", encoding="utf-8") as stream:
        stream.write(json.dumps({{"kind": "cookie", "path": str(cookie_path),
                                 "mode": stat.S_IMODE(cookie_path.stat().st_mode),
                                 "parent": str(cookie_path.parent),
                                 "parent_mode": stat.S_IMODE(cookie_path.parent.stat().st_mode)}})
                     + "\\n")
    body = b'{{"ok":true}}'
elif url == base + "/api/admin/media":
    stage = "admin-media"
    if cookie is None or Path(cookie).read_text(encoding="utf-8") != "private-cookie":
        sys.exit(88)
    body = json.dumps({{"media": [{{"filename": "{MEDIA_FILENAME}",
                                    "size": {len(MEDIA_CONTENT)}}}]}}).encode()
elif url == base + "/api/media/{MEDIA_FILENAME}":
    stage = "public-media"
    body = {MEDIA_CONTENT!r}
else:
    sys.exit(87)

with Path(os.environ["FAKE_ORDER_LOG"]).open("a", encoding="utf-8") as stream:
    stream.write(stage + "\\n")
if stage == "health" and os.environ.get("FAKE_BLOCK_MARKER"):
    if os.environ.get("FAKE_IGNORE_TERM"):
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
    Path(os.environ["FAKE_BLOCK_MARKER"]).touch()
    time.sleep(5)
if stage == os.environ.get("FAKE_FAIL_STAGE"):
    Path(output).write_text(os.environ["FAKE_FAILURE_BODY"], encoding="utf-8")
    print(os.environ["FAKE_FAILURE_BODY"], file=sys.stderr)
    sys.exit(22)
Path(output).write_bytes(body)
if write_out is not None:
    status = os.environ.get("FAKE_HTTP_STATUS", "200") if stage == os.environ.get("FAKE_STATUS_STAGE") else "200"
    sys.stdout.write(status)
'''
    npm_script = """#!/usr/bin/env bash
set -euo pipefail
[[ "$*" == "--prefix web run validate:demo-response" ]] || exit 90
cat >/dev/null
printf '%s\n' 'validator output that must be suppressed'
"""
    _write_executable(fake_bin / "curl", curl_script)
    _write_executable(fake_bin / "npm", npm_script)
    (fake_bin / "sitecustomize.py").write_text(
        '''import socket

_original_getaddrinfo = socket.getaddrinfo

def _fixture_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
    addresses = {
        "restore-drill.example.com": "93.184.216.34",
        "private-alias.example.com": "127.0.0.1",
        "production.example.com": "93.184.216.35",
    }
    if host in addresses:
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (addresses[host], port))]
    return _original_getaddrinfo(host, port, family, type, proto, flags)

socket.getaddrinfo = _fixture_getaddrinfo
''',
        encoding="utf-8",
    )

    environment = os.environ.copy()
    for proxy_variable in ("ALL_PROXY", "HTTPS_PROXY", "all_proxy", "https_proxy"):
        environment.pop(proxy_variable, None)
    environment.update(
        {
            "ADMIN_EMAIL": "operator@example.com",
            "ADMIN_PASSWORD": PASSWORD,
            "FAKE_CURL_ARGS_LOG": str(tmp_path / "curl-args.jsonl"),
            "FAKE_DEMO_RESPONSE": str(FIXTURE),
            "FAKE_FAILURE_BODY": "response-body-secret-that-must-not-leak",
            "FAKE_LOGIN_CAPTURE": str(tmp_path / "login.json"),
            "FAKE_ORDER_LOG": str(tmp_path / "order.log"),
            "FAKE_TEMP_LOG": str(tmp_path / "temp.jsonl"),
            "PATH": f"{fake_bin}{os.pathsep}{environment['PATH']}",
            "PYTHONPATH": str(fake_bin),
            "PRODUCTION_WEB_URL": "https://production.example.com",
            "RESTORE_DRILL_ISOLATED_TARGET": "confirmed",
            "RESTORE_DRILL_MEDIA_FILENAME": MEDIA_FILENAME,
            "RESTORE_DRILL_WEB_URL": TARGET_URL,
            "TMPDIR": str(tmp_path),
        }
    )
    return environment


def _run(environment: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["bash", str(SCRIPT)],
        cwd=ROOT,
        env=environment,
        capture_output=True,
        check=False,
        text=True,
    )


def _wait_for_path(path: Path, timeout_seconds: float = 2.0) -> None:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if path.exists():
            return
        time.sleep(0.01)
    raise AssertionError(f"Timed out waiting for {path.name}")


def test_restore_drill_script_declares_hardened_contract() -> None:
    content = SCRIPT.read_text(encoding="utf-8")

    for requirement in (
        "set -euo pipefail",
        "umask 077",
        "mktemp -d",
        "trap cleanup EXIT",
        "terminate 130",
        "terminate 143",
        "--connect-timeout",
        "--max-time",
        "--data-binary",
        "curl --disable",
        "--write-out",
        "npm --prefix web run validate:demo-response",
    ):
        assert requirement in content
    assert "--location" not in content
    assert "\n  -L" not in content
    assert "/tmp/senseorder-restore" not in content
    assert '"password":"$ADMIN_PASSWORD"' not in content


def test_restore_drill_runs_all_checks_in_order_without_leaking_secrets(tmp_path: Path) -> None:
    environment = _fake_environment(tmp_path)

    result = _run(environment)

    assert result.returncode == 0, result.stdout + result.stderr
    assert result.stdout == "restore drill verification passed\n"
    assert result.stderr == ""
    assert (tmp_path / "order.log").read_text(encoding="utf-8").splitlines() == [
        "health",
        "demo",
        "login",
        "admin-media",
        "public-media",
    ]
    assert json.loads((tmp_path / "login.json").read_text(encoding="utf-8")) == {
        "email": environment["ADMIN_EMAIL"],
        "password": PASSWORD,
    }
    curl_log = (tmp_path / "curl-args.jsonl").read_text(encoding="utf-8")
    assert PASSWORD not in curl_log
    assert "private-cookie" not in result.stdout + result.stderr

    temp_records = [
        json.loads(line)
        for line in (tmp_path / "temp.jsonl").read_text(encoding="utf-8").splitlines()
    ]
    assert [record["kind"] for record in temp_records] == ["login", "cookie"]
    assert {record["mode"] for record in temp_records} == {0o600}
    assert {record["parent_mode"] for record in temp_records} == {0o700}
    assert len({record["parent"] for record in temp_records}) == 1
    for record in temp_records:
        assert not Path(record["path"]).exists()
        assert not Path(record["parent"]).exists()


@pytest.mark.parametrize(
    "missing",
    [
        "RESTORE_DRILL_ISOLATED_TARGET",
        "RESTORE_DRILL_WEB_URL",
        "ADMIN_EMAIL",
        "ADMIN_PASSWORD",
        "PRODUCTION_WEB_URL",
        "RESTORE_DRILL_MEDIA_FILENAME",
    ],
)
def test_restore_drill_requires_every_environment_value(tmp_path: Path, missing: str) -> None:
    environment = _fake_environment(tmp_path)
    environment.pop(missing)

    result = _run(environment)

    assert result.returncode != 0
    assert result.stdout == ""
    assert result.stderr == "restore drill verification failed.\n"


@pytest.mark.parametrize(
    "url",
    [
        "http://restore-drill.example.com",
        "https://user:secret@restore-drill.example.com",
        "https://restore-drill.example.com?token=secret",
        "https://restore-drill.example.com/#fragment",
        "https://127.0.0.1",
        "https://10.1.2.3",
        "https://localhost",
        "https://restore.local",
    ],
)
def test_restore_drill_rejects_unsafe_or_nonpublic_targets(tmp_path: Path, url: str) -> None:
    environment = _fake_environment(tmp_path)
    environment["RESTORE_DRILL_WEB_URL"] = url

    result = _run(environment)

    assert result.returncode != 0
    assert result.stderr == "restore drill verification failed.\n"
    assert "secret" not in result.stdout + result.stderr


def test_restore_drill_rejects_the_normalized_production_target(tmp_path: Path) -> None:
    environment = _fake_environment(tmp_path)
    environment["PRODUCTION_WEB_URL"] = "https://RESTORE-DRILL.example.com:443/"

    result = _run(environment)

    assert result.returncode != 0
    assert result.stderr == "restore drill verification failed.\n"


def test_restore_drill_rejects_a_hostname_that_resolves_to_a_private_address(
    tmp_path: Path,
) -> None:
    environment = _fake_environment(tmp_path)
    environment["RESTORE_DRILL_WEB_URL"] = "https://private-alias.example.com"

    result = _run(environment)

    assert result.returncode != 0
    assert result.stderr == "restore drill verification failed.\n"


def test_restore_drill_rejects_redirect_status_even_with_an_alive_body(tmp_path: Path) -> None:
    environment = _fake_environment(tmp_path)
    environment["FAKE_STATUS_STAGE"] = "health"
    environment["FAKE_HTTP_STATUS"] = "302"

    result = _run(environment)

    assert result.returncode != 0
    assert result.stderr == "restore drill verification failed.\n"


def test_restore_drill_bypasses_inherited_proxies_without_leaking_proxy_userinfo(
    tmp_path: Path,
) -> None:
    environment = _fake_environment(tmp_path)
    proxy_secret = "proxy-user:proxy-password"
    environment["HTTPS_PROXY"] = f"http://{proxy_secret}@127.0.0.1:9999"

    result = _run(environment)

    assert result.returncode == 0, result.stdout + result.stderr
    assert result.stdout == "restore drill verification passed\n"
    assert proxy_secret not in result.stdout + result.stderr


def test_restore_drill_disables_inherited_xtrace_before_reading_credentials(
    tmp_path: Path,
) -> None:
    environment = _fake_environment(tmp_path)
    environment["SHELLOPTS"] = "xtrace"

    result = _run(environment)

    assert result.returncode == 0, result.stdout + result.stderr
    assert result.stdout == "restore drill verification passed\n"
    assert result.stderr == ""
    assert PASSWORD not in result.stdout + result.stderr


@pytest.mark.parametrize("filename", ["../asset.png", "nested/asset.png", "asset\\name.png", "."])
def test_restore_drill_rejects_unsafe_media_filenames(tmp_path: Path, filename: str) -> None:
    environment = _fake_environment(tmp_path)
    environment["RESTORE_DRILL_MEDIA_FILENAME"] = filename

    result = _run(environment)

    assert result.returncode != 0
    assert result.stderr == "restore drill verification failed.\n"


def test_restore_drill_suppresses_failed_response_bodies(tmp_path: Path) -> None:
    environment = _fake_environment(tmp_path)
    environment["FAKE_FAIL_STAGE"] = "admin-media"

    result = _run(environment)
    public_output = result.stdout + result.stderr

    assert result.returncode != 0
    assert public_output == "restore drill verification failed.\n"
    assert environment["FAKE_FAILURE_BODY"] not in public_output
    assert PASSWORD not in public_output


@pytest.mark.parametrize(
    ("sent_signal", "expected_exit"),
    [(signal.SIGINT, 130), (signal.SIGTERM, 143)],
)
def test_signal_promptly_stops_the_child_and_removes_the_private_workspace(
    tmp_path: Path,
    sent_signal: signal.Signals,
    expected_exit: int,
) -> None:
    environment = _fake_environment(tmp_path)
    block_marker = tmp_path / "curl-started"
    environment["FAKE_BLOCK_MARKER"] = str(block_marker)
    environment["FAKE_IGNORE_TERM"] = "1"
    process = subprocess.Popen(
        ["bash", str(SCRIPT)],
        cwd=ROOT,
        env=environment,
        start_new_session=True,
        stderr=subprocess.PIPE,
        stdout=subprocess.PIPE,
        text=True,
    )

    _wait_for_path(block_marker)
    signal_started = time.monotonic()
    process.send_signal(sent_signal)
    try:
        stdout, stderr = process.communicate(timeout=1)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        process.communicate()
        raise AssertionError("signal did not promptly stop the active child process") from None

    assert process.returncode == expected_exit, stdout + stderr
    assert time.monotonic() - signal_started < 0.75
    assert not tuple(tmp_path.glob("senseorder-restore-drill.*"))
