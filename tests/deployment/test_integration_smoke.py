from __future__ import annotations

import os
import stat
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SMOKE_SCRIPT = ROOT / "scripts" / "integration_smoke.sh"
FIXTURE = ROOT / "contracts" / "demo-response.json"
SERVICE_KEY = "integration-secret-that-must-not-leak"
PRIVATE_URL = "http://private-api.internal:8765"
WEB_URL = "http://public-web.local:4321"


def _write_executable(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IXUSR)


def _fake_environment(tmp_path: Path, *, authorized_status: int = 200) -> dict[str, str]:
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    curl_script = f"""#!/usr/bin/env bash
set -euo pipefail
output=/dev/null
url=""
has_key=0
method=GET
while (($#)); do
  case "$1" in
    --output) output="$2"; shift 2 ;;
    --write-out|--max-time|--connect-timeout) shift 2 ;;
    --silent|--show-error|--fail-with-body) shift ;;
    --request) method="$2"; shift 2 ;;
    --header)
      [[ "$2" == "X-SenseEngine-Service-Key: {SERVICE_KEY}" ]] && has_key=1
      shift 2
      ;;
    http://*) url="$1"; shift ;;
    *) exit 90 ;;
  esac
done
case "$url" in
  "{PRIVATE_URL}/health/ready") status=200; body='{{"status":"ready"}}' ;;
  "{PRIVATE_URL}/v1/demo/run")
    [[ "$method" == POST ]] || exit 91
    if ((has_key)); then status={authorized_status}; else status=401; fi
    body=$(<"$FAKE_RESPONSE_FILE")
    ;;
  "{WEB_URL}/api/health") status=200; body='{{"status":"alive"}}' ;;
  "{WEB_URL}/api/demo/run")
    [[ "$method" == POST ]] || exit 92
    ((has_key == 0)) || exit 93
    status=200
    body=$(<"$FAKE_RESPONSE_FILE")
    ;;
  *) exit 94 ;;
esac
if [[ "$output" != /dev/null ]]; then printf '%s' "$body" >"$output"; fi
printf '%s' "$status"
"""
    npm_script = """#!/usr/bin/env bash
set -euo pipefail
[[ "$*" == "--prefix web run validate:demo-response" ]] || exit 95
cat >/dev/null
printf '%s\n' 'validated SenseEngine demo response'
"""
    _write_executable(fake_bin / "curl", curl_script)
    _write_executable(fake_bin / "npm", npm_script)

    environment = os.environ.copy()
    environment.update(
        {
            "API_BASE_URL": PRIVATE_URL,
            "WEB_BASE_URL": WEB_URL,
            "FAKE_RESPONSE_FILE": str(FIXTURE),
            "PATH": f"{fake_bin}{os.pathsep}{environment['PATH']}",
            "SENSE_ENGINE_PRIVATE_URL": PRIVATE_URL,
            "SENSE_ENGINE_SERVICE_KEY": SERVICE_KEY,
        }
    )
    return environment


def _run_smoke(environment: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["bash", str(SMOKE_SCRIPT)],
        cwd=ROOT,
        env=environment,
        capture_output=True,
        check=False,
        text=True,
    )


def test_smoke_script_declares_secure_dual_service_contract() -> None:
    content = SMOKE_SCRIPT.read_text(encoding="utf-8")

    assert "set -euo pipefail" in content
    assert "SENSE_ENGINE_SERVICE_KEY" in content
    assert "${API_BASE_URL:-http://127.0.0.1:8000}" in content
    assert "${WEB_BASE_URL:-http://127.0.0.1:3000}" in content
    assert "mktemp" in content
    assert "umask 077" in content
    assert "trap" in content
    assert "npm --prefix web run validate:demo-response" in content
    assert content.count("npm --prefix web run validate:demo-response") == 2
    assert "/tmp/senseengine-demo-response.json" not in content
    assert "--data" not in content


def test_smoke_script_checks_api_auth_and_validates_both_bodyless_responses(
    tmp_path: Path,
) -> None:
    result = _run_smoke(_fake_environment(tmp_path))
    public_output = result.stdout + result.stderr

    assert result.returncode == 0, public_output
    assert public_output.count("validated SenseEngine demo response") == 2
    assert "API unauthorized POST: 401" in public_output
    assert "API authorized POST: 200" in public_output
    assert "Web demo POST: 200" in public_output
    assert SERVICE_KEY not in public_output
    assert PRIVATE_URL not in public_output
    assert "schema_version" not in public_output


def test_smoke_script_requires_a_nonempty_service_key(tmp_path: Path) -> None:
    environment = _fake_environment(tmp_path)
    environment["SENSE_ENGINE_SERVICE_KEY"] = ""

    result = _run_smoke(environment)

    assert result.returncode != 0
    assert "SENSE_ENGINE_SERVICE_KEY is required" in result.stderr
    assert SERVICE_KEY not in result.stdout + result.stderr


def test_smoke_script_does_not_print_failed_response_content(tmp_path: Path) -> None:
    environment = _fake_environment(tmp_path, authorized_status=503)
    private_response = tmp_path / "private-response.json"
    private_response.write_text(
        f'{{"private_url":"{PRIVATE_URL}","service_key":"{SERVICE_KEY}"}}',
        encoding="utf-8",
    )
    environment["FAKE_RESPONSE_FILE"] = str(private_response)

    result = _run_smoke(environment)
    public_output = result.stdout + result.stderr

    assert result.returncode != 0
    assert "API authorized POST: 503" in public_output
    assert SERVICE_KEY not in public_output
    assert PRIVATE_URL not in public_output
    assert "private_url" not in public_output


@pytest.mark.parametrize("variable", ["SENSE_ENGINE_SERVICE_KEY", "SENSE_ENGINE_PRIVATE_URL"])
def test_smoke_script_rejects_sensitive_values_in_responses(
    tmp_path: Path,
    variable: str,
) -> None:
    environment = _fake_environment(tmp_path)
    sensitive_response = tmp_path / "sensitive-response.json"
    sensitive_response.write_text(
        FIXTURE.read_text(encoding="utf-8").replace(
            '"simulation"',
            f'"simulation", "leaked": "{environment[variable]}"',
            1,
        ),
        encoding="utf-8",
    )
    environment["FAKE_RESPONSE_FILE"] = str(sensitive_response)

    result = _run_smoke(environment)
    public_output = result.stdout + result.stderr

    assert result.returncode != 0
    assert "contains a forbidden sensitive value" in public_output
    assert SERVICE_KEY not in public_output
    assert PRIVATE_URL not in public_output
