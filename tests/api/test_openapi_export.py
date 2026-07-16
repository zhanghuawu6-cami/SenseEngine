"""Tests for deterministic, publishable API contract exports."""

import json
import os
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import cast

import pytest

from sense_engine.api.schemas import DemoRunResponse

REPO_ROOT = Path(__file__).resolve().parents[2]
CONTRACTS_DIR = REPO_ROOT / "contracts"
SCRIPTS_DIR = REPO_ROOT / "scripts"
VISITOR_INPUT_SENTINEL = "private visitor raw input must not be exported"


def run_export(script_name: str, *arguments: str | Path) -> subprocess.CompletedProcess[str]:
    """Run one export exactly as a repository caller would."""
    environment = dict(os.environ)
    environment.update(
        {
            "SENSE_ENGINE_SERVICE_KEY": "contract-test-key",
            "SENSE_ENGINE_ENV": "contract-test",
            "SENSE_ENGINE_VISITOR_INPUT": VISITOR_INPUT_SENTINEL,
        }
    )
    return subprocess.run(
        [
            sys.executable,
            str(SCRIPTS_DIR / script_name),
            *(str(argument) for argument in arguments),
        ],
        cwd=REPO_ROOT,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )


def load_json(path: Path) -> object:
    """Load a UTF-8 JSON artifact without weakening strict test typing."""
    return cast(object, json.loads(path.read_text(encoding="utf-8")))


def object_dict(value: object) -> dict[str, object]:
    """Narrow one decoded JSON object for invariant checks."""
    assert isinstance(value, dict)
    assert all(isinstance(key, str) for key in value)
    return cast(dict[str, object], value)


@pytest.mark.parametrize(
    ("script_name", "artifact_name"),
    [
        ("export_openapi.py", "sense-engine-openapi.json"),
        ("export_demo_fixture.py", "demo-response.json"),
    ],
)
def test_export_matches_committed_contract(
    tmp_path: Path,
    script_name: str,
    artifact_name: str,
) -> None:
    output = tmp_path / "generated" / artifact_name

    result = run_export(script_name, output)

    assert result.returncode == 0, result.stderr
    assert result.stdout == ""
    assert result.stderr == ""
    assert load_json(output) == load_json(CONTRACTS_DIR / artifact_name)


@pytest.mark.parametrize(
    "script_name",
    ["export_openapi.py", "export_demo_fixture.py"],
)
@pytest.mark.parametrize("arguments", [(), ("one.json", "two.json")])
def test_export_rejects_wrong_argument_count_with_stable_usage(
    script_name: str,
    arguments: tuple[str, ...],
) -> None:
    result = run_export(script_name, *arguments)

    assert result.returncode == 2
    assert result.stdout == ""
    assert result.stderr == f"Usage: {script_name} OUTPUT\n"


@pytest.mark.parametrize(
    ("script_name", "artifact_name"),
    [
        ("export_openapi.py", "sense-engine-openapi.json"),
        ("export_demo_fixture.py", "demo-response.json"),
    ],
)
def test_export_is_byte_deterministic_utf8_sorted_and_indented(
    tmp_path: Path,
    script_name: str,
    artifact_name: str,
) -> None:
    first = tmp_path / "first" / artifact_name
    second = tmp_path / "second" / artifact_name

    first_result = run_export(script_name, first)
    second_result = run_export(script_name, second)

    assert first_result.returncode == 0, first_result.stderr
    assert second_result.returncode == 0, second_result.stderr
    first_bytes = first.read_bytes()
    assert first_bytes == second.read_bytes()
    text = first_bytes.decode("utf-8")
    assert text.endswith("\n")
    assert not text.endswith("\n\n")
    payload = cast(object, json.loads(text))
    expected = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    assert first_bytes == expected.encode("utf-8")


def test_exported_openapi_has_stable_public_contract_and_no_secrets(
    tmp_path: Path,
) -> None:
    output = tmp_path / "openapi.json"
    result = run_export("export_openapi.py", output)
    assert result.returncode == 0, result.stderr

    schema = object_dict(load_json(output))
    paths = object_dict(schema["paths"])
    operation = object_dict(object_dict(paths["/v1/demo/run"])["post"])
    responses = object_dict(operation["responses"])
    assert {"200", "400", "401", "503"} <= set(responses)

    components = object_dict(schema["components"])
    security_schemes = object_dict(components["securitySchemes"])
    matching_security_schemes = [
        name
        for name, definition in security_schemes.items()
        if definition
        == {
            "type": "apiKey",
            "in": "header",
            "name": "X-SenseEngine-Service-Key",
        }
    ]
    assert len(matching_security_schemes) == 1
    assert operation["security"] == [{matching_security_schemes[0]: []}]

    response_schema = object_dict(object_dict(components["schemas"])["DemoRunResponse"])
    assert response_schema["required"] == [
        "schema_version",
        "mode",
        "generated_at",
        "retention",
        "steps",
        "baseline_after",
    ]

    serialized = output.read_text(encoding="utf-8")
    for forbidden in (
        "contract-test-key",
        "test-service-key",
        VISITOR_INPUT_SENTINEL,
        "localhost",
        "127.0.0.1",
        "file://",
        str(REPO_ROOT),
    ):
        assert forbidden not in serialized


def test_exported_demo_fixture_is_the_fixed_simulation_without_visitor_input(
    tmp_path: Path,
) -> None:
    output = tmp_path / "demo-response.json"
    result = run_export("export_demo_fixture.py", output)
    assert result.returncode == 0, result.stderr

    payload = object_dict(load_json(output))
    serialized = output.read_text(encoding="utf-8")
    response = DemoRunResponse.model_validate_json(serialized)

    assert payload["generated_at"] == "2026-07-15T08:00:00Z"
    assert response.generated_at == datetime(2026, 7, 15, 8, 0, tzinfo=UTC)
    assert response.mode == "simulation"
    assert response.retention == "none"
    assert tuple(step.intervention.action.type for step in response.steps) == (
        "Ask",
        "Suggest Break",
        "Silence",
    )
    assert tuple(step.baseline_before for step in response.steps) == pytest.approx(
        (0.5, 0.5, 0.7)
    )
    assert response.baseline_after == pytest.approx(0.65)

    for forbidden in (
        "contract-test-key",
        "test-service-key",
        VISITOR_INPUT_SENTINEL,
        "visitor_input",
        "raw_input",
        "request_body",
    ):
        assert forbidden not in serialized
