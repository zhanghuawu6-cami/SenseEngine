from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[2]
CONFIG_PATH = ROOT / ".circleci" / "config.yml"
WORKFLOW_NAME = "verify-and-deploy"
VERIFICATION_GATES = {
    "python-gate",
    "web-gate",
    "contract-gate",
    "integration-gate",
    "browser-gate",
    "container-gate",
}
REQUIRED_JOBS = VERIFICATION_GATES | {"deploy-render"}
PRODUCTION_ENVIRONMENT = {
    "RENDER_API_KEY",
    "RENDER_API_SERVICE_ID",
    "RENDER_WEB_SERVICE_ID",
    "PRODUCTION_WEB_URL",
}


def _config() -> dict[str, Any]:
    assert CONFIG_PATH.is_file(), "CircleCI config must exist"
    loaded = yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8"))
    assert isinstance(loaded, dict)
    return loaded


def _jobs(config: dict[str, Any]) -> dict[str, dict[str, Any]]:
    jobs = config["jobs"]
    assert isinstance(jobs, dict)
    assert all(isinstance(name, str) and isinstance(job, dict) for name, job in jobs.items())
    return jobs


def _workflow_jobs(config: dict[str, Any]) -> dict[str, dict[str, Any]]:
    workflows = config["workflows"]
    assert isinstance(workflows, dict)
    workflow = workflows[WORKFLOW_NAME]
    assert isinstance(workflow, dict)
    entries = workflow["jobs"]
    assert isinstance(entries, list)

    normalized: dict[str, dict[str, Any]] = {}
    for entry in entries:
        if isinstance(entry, str):
            normalized[entry] = {}
            continue
        assert isinstance(entry, dict) and len(entry) == 1
        name, options = next(iter(entry.items()))
        assert isinstance(name, str) and isinstance(options, dict)
        normalized[name] = options
    return normalized


def _steps(job: dict[str, Any]) -> list[Any]:
    steps = job["steps"]
    assert isinstance(steps, list)
    return steps


def _commands(config: dict[str, Any]) -> dict[str, dict[str, Any]]:
    commands = config.get("commands", {})
    assert isinstance(commands, dict)
    assert all(
        isinstance(name, str) and isinstance(command, dict)
        for name, command in commands.items()
    )
    return commands


def _expanded_job_text(config: dict[str, Any], name: str) -> str:
    job = _jobs(config)[name]
    selected_commands: list[dict[str, Any]] = []
    reusable_commands = _commands(config)
    for step in _steps(job):
        if isinstance(step, str) and step in reusable_commands:
            selected_commands.append(reusable_commands[step])
        elif isinstance(step, dict):
            command_name = next(iter(step), "")
            if command_name in reusable_commands:
                selected_commands.append(reusable_commands[command_name])
    return yaml.safe_dump(
        {"job": job, "commands": selected_commands},
        allow_unicode=True,
        sort_keys=True,
    )


def _run_commands(job: dict[str, Any]) -> str:
    commands: list[str] = []
    for step in _steps(job):
        if not isinstance(step, dict) or "run" not in step:
            continue
        run = step["run"]
        if isinstance(run, str):
            commands.append(run)
        else:
            assert isinstance(run, dict)
            command = run["command"]
            assert isinstance(command, str)
            commands.append(command)
    return "\n".join(commands)


def test_config_is_circleci_21_and_every_job_checks_out_source() -> None:
    config = _config()

    assert config["version"] == 2.1
    jobs = _jobs(config)
    assert REQUIRED_JOBS <= set(jobs)
    for name in REQUIRED_JOBS:
        assert "checkout" in _steps(jobs[name]), f"{name} must checkout source"


def test_workflow_has_required_parallel_gates_and_safe_deployment_dag() -> None:
    workflow_jobs = _workflow_jobs(_config())

    assert REQUIRED_JOBS <= set(workflow_jobs)
    assert set(workflow_jobs["integration-gate"]["requires"]) == {
        "python-gate",
        "web-gate",
        "contract-gate",
    }
    assert workflow_jobs["browser-gate"]["requires"] == ["integration-gate"]
    assert set(workflow_jobs["container-gate"]["requires"]) == {
        "python-gate",
        "web-gate",
    }
    assert set(workflow_jobs["deploy-render"]["requires"]) == VERIFICATION_GATES


def test_deployment_is_main_only_serialized_and_protected_by_context() -> None:
    deploy = _workflow_jobs(_config())["deploy-render"]

    assert deploy["context"] == "senseorder-production"
    assert deploy["filters"] == {
        "branches": {"only": "main"},
        "tags": {"ignore": "/.*/"},
    }
    serial_group = deploy["serial-group"]
    assert isinstance(serial_group, str) and serial_group.strip()
    assert serial_group.startswith("<< pipeline.project.slug >>/")


def test_verification_gates_cannot_access_production_context_or_variables() -> None:
    config = _config()
    workflow_jobs = _workflow_jobs(config)

    for name in VERIFICATION_GATES:
        assert "context" not in workflow_jobs[name]
        text = _expanded_job_text(config, name)
        assert "senseorder-production" not in text
        for variable in PRODUCTION_ENVIRONMENT:
            assert variable not in text


def test_python_gate_uses_pinned_uv_locked_dependencies_and_full_checks() -> None:
    config = _config()
    job = _jobs(config)["python-gate"]
    image = job["docker"][0]["image"]
    text = _expanded_job_text(config, "python-gate")

    assert image == "cimg/python:3.12-node"
    assert "uv-x86_64-unknown-linux-gnu.tar.gz" in text
    assert "uv --version" in text
    assert "uv sync --frozen --all-extras" in text
    assert "uv run pytest" in text
    assert "uv run mypy" in text
    assert "uv run ruff check ." in text


def test_web_gate_uses_node_22_locked_install_checks_and_production_build() -> None:
    config = _config()
    job = _jobs(config)["web-gate"]
    image = job["docker"][0]["image"]
    text = _expanded_job_text(config, "web-gate")

    assert image.startswith("cimg/node:22") and image.endswith("-browsers")
    assert "npm --prefix web ci" in text
    assert "npm --prefix web run test" in text
    assert "npm --prefix web run typecheck" in text
    assert "npm --prefix web run lint" in text
    assert "DATABASE_PATH=/tmp/" in text
    assert "NODE_ENV=production" in text
    assert "npm --prefix web run build" in text


def test_contract_gate_regenerates_and_diffs_all_generated_contracts() -> None:
    text = _expanded_job_text(_config(), "contract-gate")

    assert "scripts/export_openapi.py contracts/sense-engine-openapi.json" in text
    assert "scripts/export_demo_fixture.py contracts/demo-response.json" in text
    assert "npm --prefix web run generate:api" in text
    assert "git diff --exit-code --" in text
    for generated_path in (
        "contracts/sense-engine-openapi.json",
        "contracts/demo-response.json",
        "web/lib/generated/sense-engine-api.d.ts",
    ):
        assert generated_path in text


def test_integration_gate_supervises_production_services_and_runs_real_smoke() -> None:
    command = _run_commands(_jobs(_config())["integration-gate"])

    assert "set -euo pipefail" in command
    assert "trap cleanup EXIT" in command
    assert "trap 'exit 130' INT" in command
    assert "trap 'exit 143' TERM" in command
    assert "uv run uvicorn sense_engine.api.app:app" in command
    assert "npm --prefix web run build" in command
    assert "cp -R web/public web/.next/standalone/public" in command
    assert "cp -R web/.next/static web/.next/standalone/.next/static" in command
    assert "cd web/.next/standalone" in command
    assert "node server.js" in command
    assert "scripts/integration_smoke.sh" in command
    assert command.index("scripts/integration_smoke.sh") < command.index("/_next/static/")
    assert "fetch(assetUrl)" in command
    assert "if (!assetResponse.ok) process.exit(1)" in command
    assert "circleci-integration-test-key" in command
    assert "set -x" not in command
    assert "echo" not in command
    assert "console.log" not in command
    assert "console.error" not in command


def test_browser_gate_installs_chromium_runs_e2e_and_preserves_diagnostics() -> None:
    config = _config()
    job = _jobs(config)["browser-gate"]
    image = job["docker"][0]["image"]
    text = _expanded_job_text(config, "browser-gate")
    steps = _steps(job)

    assert image.startswith("cimg/node:22") and image.endswith("-browsers")
    assert "npm --prefix web ci" in text
    assert "playwright install chromium" in text
    assert "npm --prefix web run test:e2e" in text
    assert any(isinstance(step, dict) and "store_test_results" in step for step in steps)
    artifact_paths = {
        step["store_artifacts"]["path"]
        for step in steps
        if isinstance(step, dict) and isinstance(step.get("store_artifacts"), dict)
    }
    assert {"web/test-results", "web/playwright-report"} <= artifact_paths


def test_container_gate_builds_non_root_images_and_checks_isolated_health() -> None:
    job = _jobs(_config())["container-gate"]
    steps = _steps(job)
    command = _run_commands(job)

    assert any(isinstance(step, dict) and "setup_remote_docker" in step for step in steps)
    assert "docker build -f Dockerfile.api" in command
    assert "docker build -f web/Dockerfile" in command
    assert "docker image inspect" in command
    assert "app" in command and "nextjs" in command
    assert "docker network create" in command
    assert "docker volume create" in command
    assert "docker exec" in command
    assert "/health/ready" in command
    assert "/api/health" in command
    assert "trap cleanup EXIT" in command
    assert "trap 'exit 130' INT" in command
    assert "trap 'exit 143' TERM" in command
    assert "status=$?" in command
    assert '[[ "$status" -ne 0 ]]' in command
    assert 'docker logs --tail 200 "$api_container" >&2 || true' in command
    assert 'docker logs --tail 200 "$web_container" >&2 || true' in command
    assert command.index("docker logs --tail 200") < command.index("docker rm --force")
    assert 'exit "$status"' in command


def test_container_gate_runs_restore_verifier_in_the_final_non_root_web_image() -> None:
    command = _run_commands(_jobs(_config())["container-gate"])

    assert "web_image='senseorder-web:ci'" in command
    assert "CREATE TABLE IF NOT EXISTS media" in command
    assert "INSERT INTO media" in command
    assert "writeFileSync" in command
    assert "circleci-restore-fixture.png" in command
    verifier = 'docker exec "$web_container" node scripts/verify-restored-data.mjs'
    assert verifier in command
    assert "--user root" not in command
    assert command.index("/api/demo/run") < command.index("INSERT INTO media")
    assert command.index("INSERT INTO media") < command.index(verifier)


def test_deploy_job_runs_release_controller_through_locked_environment() -> None:
    text = _expanded_job_text(_config(), "deploy-render")

    assert "uv-x86_64-unknown-linux-gnu.tar.gz" in text
    assert "uv sync --frozen --all-extras" in text
    assert 'CIRCLE_SHA1="$CIRCLE_SHA1" uv run python scripts/render_release.py' in text


def test_uv_installer_uses_a_pinned_verified_artifact_without_remote_scripts() -> None:
    command = _run_commands(_commands(_config())["install-uv"])

    assert re.search(r"\|\s*(?:sh|bash)(?:\s|$)", command) is None
    assert (
        "https://github.com/astral-sh/uv/releases/download/0.8.6/"
        "uv-x86_64-unknown-linux-gnu.tar.gz"
    ) in command
    assert "5429c9b96cab65198c2e5bfe83e933329aa16303a0369d5beedc71785a4a2f36" in command
    assert "/tmp/uv-x86_64-unknown-linux-gnu.tar.gz" in command
    assert "sha256sum --check" in command
    assert "tar -xzf" in command
    assert 'install -m 755' in command
    assert '"$HOME/.local/bin/uv"' in command
    assert "uv --version" in command


def test_dependency_caches_are_lockfile_keyed_and_exclude_runtime_state() -> None:
    config = _config()
    serialized = yaml.safe_dump(config, sort_keys=True)
    cache_keys: list[str] = []
    cached_paths: list[str] = []

    step_owners = [*_commands(config).values(), *_jobs(config).values()]
    for owner in step_owners:
        for step in _steps(owner):
            if not isinstance(step, dict):
                continue
            restore = step.get("restore_cache")
            if isinstance(restore, dict):
                keys = restore["keys"]
                assert isinstance(keys, list) and all(isinstance(key, str) for key in keys)
                cache_keys.extend(keys)
            save = step.get("save_cache")
            if isinstance(save, dict):
                key = save["key"]
                paths = save["paths"]
                assert isinstance(key, str)
                assert isinstance(paths, list) and all(isinstance(path, str) for path in paths)
                cache_keys.append(key)
                cached_paths.extend(paths)

    assert any('{{ checksum "uv.lock" }}' in key for key in cache_keys)
    assert any('{{ checksum "web/package-lock.json" }}' in key for key in cache_keys)
    assert set(cached_paths) == {"~/.cache/uv", "~/.npm"}
    for forbidden in ("node_modules", ".env", ".db", "media", "public/uploads"):
        assert forbidden not in "\n".join(cached_paths)
    assert "{{ epoch }}" not in serialized
    assert "revision" not in serialized.lower()


def test_config_contains_no_real_deployment_url_or_hardcoded_secret() -> None:
    content = CONFIG_PATH.read_text(encoding="utf-8")

    assert ".onrender.com" not in content
    assert "api.render.com" not in content
    assert "RENDER_API_KEY:" not in content
    assert "PRODUCTION_WEB_URL:" not in content
    assert "BEGIN PRIVATE KEY" not in content
    assert "set -x" not in content
