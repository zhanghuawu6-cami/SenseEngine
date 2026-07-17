import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SENSITIVE_BUILD_VARIABLES = (
    "ADMIN_EMAIL",
    "ADMIN_PASSWORD",
    "MEDIA_ROOT",
    "SENSE_ENGINE_PRIVATE_URL",
    "SENSE_ENGINE_SERVICE_KEY",
    "SESSION_SECRET",
)


def _stage(dockerfile: str, name: str) -> str:
    match = re.search(
        rf"^FROM [^\n]+ AS {re.escape(name)}\n(?P<body>.*?)(?=^FROM |\Z)",
        dockerfile,
        flags=re.MULTILINE | re.DOTALL,
    )
    assert match is not None, f"Missing Docker stage: {name}"
    return match.group("body")


def _ignore_rules(path: Path) -> set[str]:
    return {
        line.strip()
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    }


def test_api_container_uses_locked_production_dependencies_and_minimal_inputs() -> None:
    dockerfile = (ROOT / "Dockerfile.api").read_text(encoding="utf-8")

    assert "FROM ghcr.io/astral-sh/uv:0.8.6 AS uv" in dockerfile
    assert "FROM python:3.12-slim AS builder" in dockerfile
    assert "FROM python:3.12-slim AS runner" in dockerfile
    assert "uv sync --frozen --no-dev --no-editable" in dockerfile
    assert "COPY pyproject.toml uv.lock README.md ./" in dockerfile
    assert "COPY src ./src" in dockerfile
    assert "COPY . ." not in dockerfile

    runner = _stage(dockerfile, "runner")
    assert "USER app" in runner
    assert 'CMD ["uvicorn", "sense_engine.api.app:app"' in runner
    assert "/app/.venv" in runner
    assert "COPY src" not in runner
    assert " uv " not in runner


def test_api_build_context_excludes_non_runtime_and_sensitive_artifacts() -> None:
    rules = _ignore_rules(ROOT / ".dockerignore")

    assert {
        ".git",
        ".venv",
        ".mypy_cache",
        ".pytest_cache",
        ".ruff_cache",
        ".superpowers",
        ".env*",
        "*.db",
        "*.db-*",
        "contracts",
        "docs",
        "examples",
        "scripts",
        "tests",
        "web",
        ".pypirc",
        "pip.conf",
        "*.pem",
        "*.key",
    } <= rules


def test_web_container_uses_locked_build_and_minimal_standalone_runner() -> None:
    dockerfile = (ROOT / "web" / "Dockerfile").read_text(encoding="utf-8")

    assert dockerfile.count("FROM node:22-bookworm-slim") == 3
    deps = _stage(dockerfile, "deps")
    assert "COPY package.json package-lock.json ./" in deps
    assert "RUN npm ci" in deps
    assert "RUN npm run build" in _stage(dockerfile, "builder")
    assert "DATABASE_PATH=/tmp/senseorder-build.db" in _stage(dockerfile, "builder")

    runner = _stage(dockerfile, "runner")
    assert "USER nextjs" in runner
    assert "--uid 1001" in runner
    assert "mkdir -p /var/data" in runner
    assert "chown nextjs:nodejs /var/data" in runner
    assert "/app/.next/standalone ./" in runner
    assert "/app/.next/static ./.next/static" in runner
    assert 'CMD ["node", "server.js"]' in runner
    assert (
        "COPY --from=builder --chown=nextjs:nodejs "
        "/app/scripts/verify-restored-data.mjs ./scripts/verify-restored-data.mjs"
    ) in runner
    assert "COPY --from=deps" not in runner
    assert "/app/node_modules" not in runner
    assert "npm ci" not in runner
    assert "npm install" not in runner
    assert "COPY . ." not in runner
    assert "DATABASE_PATH" not in runner


def test_web_dependency_stage_can_compile_native_addons_without_prebuilds() -> None:
    dockerfile = (ROOT / "web" / "Dockerfile").read_text(encoding="utf-8")

    deps = _stage(dockerfile, "deps")
    assert "apt-get update" in deps
    assert "apt-get install --no-install-recommends" in deps
    assert "python3" in deps
    assert "make" in deps
    assert "g++" in deps
    assert "rm -rf /var/lib/apt/lists/*" in deps

    runner = _stage(dockerfile, "runner")
    assert "apt-get" not in runner
    assert "python3" not in runner
    assert "g++" not in runner


def test_web_build_context_excludes_local_state_secrets_and_generated_files() -> None:
    rules = _ignore_rules(ROOT / "web" / ".dockerignore")

    assert {
        ".env*",
        ".next",
        "*.tsbuildinfo",
        "blob-report",
        "docs",
        "e2e",
        "data/*.db*",
        "node_modules",
        "npm-debug.log*",
        "playwright.config.ts",
        "playwright-report",
        "public/uploads/*",
        "test-results",
        "tests",
        ".npmrc",
        ".yarnrc*",
        "*.pem",
        "*.key",
    } <= rules
    assert "!public/uploads/.gitkeep" in rules


def test_container_builds_do_not_accept_or_embed_runtime_secrets() -> None:
    dockerfiles = (
        (ROOT / "Dockerfile.api").read_text(encoding="utf-8"),
        (ROOT / "web" / "Dockerfile").read_text(encoding="utf-8"),
    )

    for dockerfile in dockerfiles:
        assert not re.search(r"^ARG\s", dockerfile, flags=re.MULTILINE)
        for variable in SENSITIVE_BUILD_VARIABLES:
            assert variable not in dockerfile


def test_next_build_emits_standalone_output_without_weakening_existing_guards() -> None:
    config = (ROOT / "web" / "next.config.ts").read_text(encoding="utf-8")

    assert 'output: "standalone"' in config
    assert "poweredByHeader: false" in config
    assert "outputFileTracingRoot: process.cwd()" in config
