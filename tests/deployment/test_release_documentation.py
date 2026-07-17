from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
README = (ROOT / "README.md").read_text(encoding="utf-8")
INTEGRATION_DESIGN = (
    ROOT / "docs/superpowers/specs/2026-07-15-senseorder-web-experience-integration-design.md"
).read_text(encoding="utf-8")


def _assert_environment_row(variable: str, classification: str) -> None:
    pattern = rf"\|\s*`{re.escape(variable)}`\s*\|\s*{re.escape(classification)}\s*\|"
    assert re.search(pattern, README), (
        f"README must classify {variable} as {classification} in the environment table"
    )


def test_readme_describes_the_current_integrated_product() -> None:
    assert "intentionally implements no inference" not in README
    assert "no inference, storage, policy execution" not in README

    for capability in (
        "FastAPI",
        "Next.js",
        "StateEstimator",
        "StateMemoryBank",
        "InterventionPolicy",
        "SQLite",
        "状态感知与干预演示",
    ):
        assert capability in README


def test_readme_has_locked_install_and_executable_local_run_commands() -> None:
    for command in (
        "uv sync --frozen --all-extras",
        "npm --prefix web ci",
        "uv run uvicorn sense_engine.api.app:app --host 127.0.0.1 --port 8000",
        "npm --prefix web run dev",
        "npm --prefix web run build",
        "npm --prefix web run start",
        "scripts/integration_smoke.sh",
    ):
        assert command in README

    assert "三个终端" in README
    assert "local-demo-test-key" in README
    assert "API_BASE_URL=http://127.0.0.1:8000" in README
    assert "WEB_BASE_URL=http://127.0.0.1:3000" in README


def test_readme_classifies_every_runtime_and_release_variable() -> None:
    for variable in (
        "SENSE_ENGINE_SERVICE_KEY",
        "SENSE_ENGINE_PRIVATE_URL",
        "SENSE_ENGINE_ENV",
        "NODE_ENV",
        "UVICORN_LOG_LEVEL",
        "DATABASE_PATH",
        "MEDIA_ROOT",
        "ADMIN_EMAIL",
        "ADMIN_PASSWORD",
        "SESSION_SECRET",
    ):
        _assert_environment_row(variable, "server-only")

    _assert_environment_row("NEXT_PUBLIC_SITE_URL", "public")

    for variable in (
        "RENDER_API_KEY",
        "RENDER_API_SERVICE_ID",
        "RENDER_WEB_SERVICE_ID",
        "PRODUCTION_WEB_URL",
    ):
        _assert_environment_row(variable, "CI-only")

    assert "`NEXT_PUBLIC_SITE_URL` 可公开" in README
    assert "SENSE_ENGINE_PRIVATE_URL` 和 `SENSE_ENGINE_SERVICE_KEY` 绝不得使用 `NEXT_PUBLIC_`" in README

    assert not re.search(r"\|\s*`LOG_LEVEL`\s*\|", README)
    assert "\nLOG_LEVEL=info \\" not in README
    assert "UVICORN_LOG_LEVEL=info" in README


def test_readme_sets_and_explains_node_env_for_local_production() -> None:
    assert "NODE_ENV=production" in README
    assert "Next.js 生产行为" in README
    assert "Secure Cookie" in README


def test_integration_design_uses_the_effective_uvicorn_log_variable() -> None:
    assert "`UVICORN_LOG_LEVEL=info`" in INTEGRATION_DESIGN
    assert "`LOG_LEVEL=info`" not in INTEGRATION_DESIGN


def test_readme_documents_the_single_instance_render_consistency_boundary() -> None:
    for requirement in (
        "公开 Web",
        "私有 API",
        "auto deploy",
        "numInstances=1",
        "1 GB",
        "`/var/data`",
        "`/var/data/senseorder.db`",
        "`/var/data/media`",
        "同一一致性边界",
        "PostgreSQL",
        "对象存储",
        "禁止扩容 Web 实例",
    ):
        assert requirement in README


def test_readme_documents_snapshot_restore_and_quarterly_drills() -> None:
    for requirement in (
        "每 24 小时自动创建",
        "Render Dashboard",
        "同一快照",
        "整体恢复",
        "禁止单独恢复",
        "每季度",
        "Dashboard 的 Restore",
        "不是 CLI 命令",
        "临时隔离 Web service",
        "独立持久磁盘",
        "不切换 DNS",
        "不接入生产流量",
        "单实例",
        "不得在 production 原地 restore",
        "STOP",
        "Render 支持",
        "站外一致性备份",
        "scripts/verify_restore_drill.sh",
        "node scripts/verify-restored-data.mjs",
        "read -rs",
        "`PRODUCTION_WEB_URL` 也是必填项",
        "销毁隔离",
    ):
        assert requirement in README

    for forbidden in (
        "/tmp/senseorder-restore-drill.cookies",
        "/tmp/senseorder-restore-media.bin",
        '"password":"$ADMIN_PASSWORD"',
        "node -e 'const fs=",
        "开启并定期确认每日",
    ):
        assert forbidden not in README


def test_readme_documents_circleci_gates_and_production_release_controls() -> None:
    for gate in (
        "python-gate",
        "web-gate",
        "contract-gate",
        "integration-gate",
        "browser-gate",
        "container-gate",
    ):
        assert f"`{gate}`" in README

    assert "`senseorder-production`" in README
    assert "仅 `main`" in README
    assert "`serial-group`" in README
    for variable in (
        "RENDER_API_KEY",
        "RENDER_API_SERVICE_ID",
        "RENDER_WEB_SERVICE_ID",
        "PRODUCTION_WEB_URL",
    ):
        assert f"`{variable}`" in README


def test_readme_requires_external_protection_for_the_production_context() -> None:
    for requirement in (
        "外部安全边界",
        "Organization Settings",
        "Project restrictions",
        "`gh/zhanghuawu6-cami/SenseEngine`",
        "Expression restrictions",
        '`pipeline.git.branch == "main"`',
        "job filter 本身不能保护 context",
        "`All members`",
        "feature branch",
        "unauthorized",
        "只读验证",
        "main 正向验证",
        "禁止生产部署",
        "CircleCI token",
        "不能证明平台状态",
    ):
        assert requirement in README

    context_section = README.split("## CircleCI 门禁与发布", maxsplit=1)[1]
    assert re.search(
        r"senseorder-production[\s\S]{0,1200}Project restrictions"
        r"[\s\S]{0,1200}Expression restrictions",
        context_section,
    )
    assert re.search(
        r"两项限制[\s\S]{0,300}正负验证[\s\S]{0,300}\*\*STOP\*\*"
        r"[\s\S]{0,100}禁止生产部署",
        context_section,
    )
    assert re.search(
        r"feature branch[\s\S]{0,300}(?:context unauthorized|部署 job 不应获得 secret)",
        context_section,
    )


def test_readme_documents_automatic_and_manual_rollback_without_credentials() -> None:
    for requirement in (
        "自动回滚",
        "旧 Web deploy",
        "旧 API deploy",
        "Render Dashboard",
        "最后一个已知可用 deploy",
        '"$PRODUCTION_WEB_URL/api/health"',
    ):
        assert requirement in README

    for forbidden in (
        ".env",
        "api.render.com",
        "dashboard.render.com",
        "rnd_",
        "RENDER_API_KEY=",
    ):
        assert forbidden not in README
