# SenseEngine Demo API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增经过服务间认证、每请求隔离、一次返回三个固定场景的 FastAPI 演示 API，并发布可生成 TypeScript 类型的 OpenAPI 契约。

**Architecture:** `demo_scenarios.py` 只把固定演示定义转换为现有 `SignalEvent` 和 `ContextSnapshot`；`DemoService` 每次调用创建新的 `StateMemoryBank`，依序调用现有估计器和策略。FastAPI 应用验证密钥、拒绝请求体、返回全有或全无响应，并将内部失败收敛为无敏感信息的 503。

**Tech Stack:** Python 3.12、FastAPI、Pydantic v2、Uvicorn、httpx/TestClient、pytest、mypy strict、Ruff、uv

---

## 文件结构

**创建：**

- `src/sense_engine/api/schemas.py`：演示 API Pydantic 响应契约。
- `src/sense_engine/api/demo_scenarios.py`：三个固定场景的证据工厂。
- `src/sense_engine/api/demo_service.py`：请求内状态循环编排。
- `src/sense_engine/api/security.py`：环境设置和恒定时间密钥校验。
- `src/sense_engine/api/app.py`：FastAPI 应用、健康检查和错误边界。
- `tests/api/conftest.py`：测试服务密钥环境。
- `tests/api/test_schemas.py`：响应契约测试。
- `tests/api/test_demo_scenarios.py`：固定证据测试。
- `tests/api/test_demo_service.py`：顺序、基线和隔离测试。
- `tests/api/test_app.py`：HTTP、认证和错误测试。
- `tests/helpers.py`：API 契约测试共用的合法核心对象工厂。
- `tests/__init__.py`、`tests/api/__init__.py`：稳定测试模块身份。
- `scripts/export_openapi.py`：确定性导出 OpenAPI。
- `scripts/export_demo_fixture.py`：导出确定性的真实演示响应 fixture。
- `contracts/sense-engine-openapi.json`：提交的跨服务契约。
- `contracts/demo-response.json`：跨语言 Zod 和集成测试 fixture。
- `uv.lock`：Python 生产与开发依赖锁。

**修改：**

- `pyproject.toml`：ASGI、测试依赖和 Python 3.12 工具配置。
- `src/sense_engine/api/__init__.py`：保持包存在但不导出应用单例。

### Task 1: 锁定 Python 运行环境与健康检查

- [ ] **Step 1: 更新依赖并生成锁文件**

在 `pyproject.toml` 的生产依赖加入：

```toml
"uvicorn[standard]>=0.35,<1",
```

在 dev 依赖加入：

```toml
"httpx>=0.28,<1",
```

将 mypy 和 Ruff 的 Python 版本统一为 3.12：

```toml
[tool.mypy]
python_version = "3.12"

[tool.ruff]
target-version = "py312"
```

Run: `uv lock`

Run: `uv sync --frozen --all-extras`

Expected: 生成 `uv.lock`，两条命令退出码为 0。

- [ ] **Step 2: 设置 API 测试环境**

创建 `tests/api/conftest.py`：

```python
import os


os.environ.setdefault("SENSE_ENGINE_SERVICE_KEY", "test-service-key")
os.environ.setdefault("SENSE_ENGINE_ENV", "test")
```

- [ ] **Step 3: 编写健康检查 Red 测试**

创建 `tests/api/test_app.py`：

```python
from fastapi.testclient import TestClient

from sense_engine.api.app import app


client = TestClient(app)


def test_liveness_is_process_only() -> None:
    response = client.get("/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "alive"}


def test_readiness_confirms_core_loaded() -> None:
    response = client.get("/health/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ready"}
```

- [ ] **Step 4: 运行测试确认 Red**

Run: `uv run pytest tests/api/test_app.py -v`

Expected: FAIL，因为 `sense_engine.api.app` 不存在。

- [ ] **Step 5: 创建最小 FastAPI 应用**

创建 `src/sense_engine/api/app.py`：

```python
from fastapi import FastAPI

from sense_engine.core.state_estimator import StateEstimator
from sense_engine.policy.intervention_policy import InterventionPolicy


def create_app() -> FastAPI:
    application = FastAPI(title="SenseEngine API", version="1.0.0")

    @application.get("/health/live")
    def live() -> dict[str, str]:
        return {"status": "alive"}

    @application.get("/health/ready")
    def ready() -> dict[str, str]:
        StateEstimator()
        InterventionPolicy()
        return {"status": "ready"}

    return application


app = create_app()
```

- [ ] **Step 6: 运行健康测试确认 Green**

Run: `uv run pytest tests/api/test_app.py -v`

Expected: `2 passed`。

- [ ] **Step 7: 提交运行基线**

```bash
git add pyproject.toml uv.lock src/sense_engine/api/app.py tests/api
git commit -m "build: add SenseEngine API runtime"
```

### Task 2: 定义严格公开响应契约

- [ ] **Step 1: 编写响应模型 Red 测试**

创建 `tests/helpers.py`：

```python
from sense_engine.core.models.intervention import (
    ActionSpec,
    Intervention,
    Reversibility,
    RiskAssessment,
    RiskLevel,
)
from sense_engine.core.models.state_estimate import StateEstimate


def make_estimate(*, cognitive_load: float, confidence: float) -> StateEstimate:
    return StateEstimate(
        dimensions={"cognitive_load": cognitive_load},
        distribution={
            "flow": 0.25,
            "friction": 0.25,
            "cognitive_overload": 0.25,
            "unknown": 0.25,
        },
        confidence=confidence,
        missingness={},
        model_version="test-model",
        explanation=("test evidence",),
    )


def make_intervention(*, action_type: str) -> Intervention:
    return Intervention(
        objective="test-objective",
        action=ActionSpec(type=action_type, channel="none", parameters={}),
        risk=RiskAssessment(level=RiskLevel.LOW, rationale="测试安全理由"),
        reversibility=Reversibility(
            is_reversible=True,
            method="dismiss",
            recovery_seconds=0.0,
        ),
        expected_effect={"cognitive_load": 0.0},
    )
```

同时创建 `tests/__init__.py` 与 `tests/api/__init__.py`，内容分别为 `"""SenseEngine tests."""` 和 `"""SenseEngine API tests."""`，确保 pytest 与 mypy 对 helper 使用同一模块名。

创建 `tests/api/test_schemas.py`：

```python
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from sense_engine.api.schemas import (
    DemoEvidence,
    DemoRunResponse,
    DemoScenario,
    DemoStep,
    ScenarioId,
)
from tests.helpers import make_estimate, make_intervention


NOW = datetime(2026, 7, 15, 8, 0, tzinfo=UTC)


def make_step(sequence: int, scenario_id: ScenarioId, baseline: float) -> DemoStep:
    return DemoStep(
        scenario=DemoScenario(
            id=scenario_id,
            sequence=sequence,
            title="场景",
            description="固定模拟场景",
            evidence=(DemoEvidence(label="证据", value="模拟"),),
        ),
        baseline_before=baseline,
        estimate=make_estimate(cognitive_load=0.5, confidence=0.8),
        intervention=make_intervention(action_type="Silence"),
    )


def test_demo_response_requires_exact_ordered_scenarios() -> None:
    response = DemoRunResponse(
        generated_at=NOW,
        steps=(
            make_step(1, "insufficient-evidence", 0.5),
            make_step(2, "long-meeting", 0.5),
            make_step(3, "deep-focus", 0.7),
        ),
        baseline_after=0.65,
    )

    assert response.schema_version == "1.0"
    assert response.mode == "simulation"
    assert response.retention == "none"


def test_demo_response_rejects_wrong_scenario_order() -> None:
    with pytest.raises(ValidationError):
        DemoRunResponse(
            generated_at=NOW,
            steps=(
                make_step(2, "long-meeting", 0.5),
                make_step(1, "insufficient-evidence", 0.5),
                make_step(3, "deep-focus", 0.7),
            ),
            baseline_after=0.65,
        )


def test_demo_response_rejects_naive_generated_at() -> None:
    with pytest.raises(ValidationError):
        DemoRunResponse(
            generated_at=datetime(2026, 7, 15, 8, 0),
            steps=(
                make_step(1, "insufficient-evidence", 0.5),
                make_step(2, "long-meeting", 0.5),
                make_step(3, "deep-focus", 0.7),
            ),
            baseline_after=0.65,
        )
```

- [ ] **Step 2: 运行测试确认 Red**

Run: `uv run pytest tests/api/test_schemas.py -v`

Expected: FAIL，因为 `sense_engine.api.schemas` 不存在。

- [ ] **Step 3: 实现响应模型**

创建 `src/sense_engine/api/schemas.py`：

```python
from datetime import datetime
from typing import Literal, Self

from pydantic import Field, field_validator, model_validator

from sense_engine.core.models.base import ContractModel
from sense_engine.core.models.common import NonEmptyStr, Probability
from sense_engine.core.models.intervention import Intervention
from sense_engine.core.models.state_estimate import StateEstimate

ScenarioId = Literal["insufficient-evidence", "long-meeting", "deep-focus"]


class DemoEvidence(ContractModel):
    label: NonEmptyStr
    value: NonEmptyStr


class DemoScenario(ContractModel):
    id: ScenarioId
    sequence: int = Field(ge=1, le=3)
    title: NonEmptyStr
    description: NonEmptyStr
    evidence: tuple[DemoEvidence, ...] = Field(min_length=1)


class DemoStep(ContractModel):
    scenario: DemoScenario
    baseline_before: Probability
    estimate: StateEstimate
    intervention: Intervention


class DemoRunResponse(ContractModel):
    schema_version: Literal["1.0"] = "1.0"
    mode: Literal["simulation"] = "simulation"
    generated_at: datetime
    retention: Literal["none"] = "none"
    steps: tuple[DemoStep, DemoStep, DemoStep]
    baseline_after: Probability

    @field_validator("generated_at")
    @classmethod
    def validate_generated_at(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("generated_at must be timezone-aware")
        return value

    @model_validator(mode="after")
    def validate_order(self) -> Self:
        expected = (
            (1, "insufficient-evidence"),
            (2, "long-meeting"),
            (3, "deep-focus"),
        )
        actual = tuple((item.scenario.sequence, item.scenario.id) for item in self.steps)
        if actual != expected:
            raise ValueError("demo steps must use the fixed scenario order")
        return self


class ApiError(ContractModel):
    code: Literal["unauthorized", "invalid_request", "demo_unavailable"]
    message: NonEmptyStr


class ErrorResponse(ContractModel):
    error: ApiError
```

- [ ] **Step 4: 运行模型测试确认 Green**

Run: `uv run pytest tests/api/test_schemas.py -v`

Expected: `3 passed`。

- [ ] **Step 5: 运行静态检查并提交**

Run: `uv run mypy src tests`

Run: `uv run ruff check src tests`

Expected: 均退出码为 0。

```bash
git add src/sense_engine/api/schemas.py tests/api/test_schemas.py tests/helpers.py tests/__init__.py tests/api/__init__.py
git commit -m "feat: define SenseEngine demo API contract"
```

### Task 3: 构造三个固定场景

- [ ] **Step 1: 编写场景工厂 Red 测试**

创建 `tests/api/test_demo_scenarios.py`，固定 `NOW` 并断言：

```python
def test_fixed_scenarios_map_to_existing_contracts() -> None:
    scenarios = build_demo_scenarios(NOW)

    assert tuple(item.scenario.id for item in scenarios) == (
        "insufficient-evidence",
        "long-meeting",
        "deep-focus",
    )
    assert scenarios[0].signal_events == ()
    assert scenarios[1].context.activity is not None
    assert scenarios[1].context.activity.name == "Meeting"
    meeting = scenarios[1].context.calendar[0]
    assert (meeting.ends_at - meeting.starts_at).total_seconds() == 90 * 60
    value = scenarios[2].signal_events[0].feature.value
    assert isinstance(value, dict)
    assert value["typing_speed"] == "High"
    assert value["mouse_movement_frequency"] == "Low"
```

- [ ] **Step 2: 运行测试确认 Red**

Run: `uv run pytest tests/api/test_demo_scenarios.py -v`

Expected: FAIL，因为 `build_demo_scenarios` 不存在。

- [ ] **Step 3: 实现场景工厂**

创建 `src/sense_engine/api/demo_scenarios.py`，定义冻结 dataclass：

```python
@dataclass(frozen=True, slots=True)
class DemoScenarioInput:
    scenario: DemoScenario
    signal_events: tuple[SignalEvent, ...]
    context: ContextSnapshot
```

实现私有 `_computer_activity_event(now, typing_speed, mouse_frequency)`，导入 `cast` 与 `FiniteJsonValue`，其字段必须与现有演示契约一致：

```python
return SignalEvent(
    time=now,
    source=SignalSource(
        adapter="web_demo",
        device_id="fixed-demo-device",
        modality="computer_activity",
    ),
    feature=FeaturePayload(
        name="computer_activity_snapshot",
        value=cast(
            FiniteJsonValue,
            {
                "schema_version": "1.0",
                "active_window": "VS Code",
                "typing_speed": typing_speed,
                "mouse_movement_frequency": mouse_frequency,
            },
        ),
        unit=None,
    ),
    quality=SignalQuality(score=1.0, completeness=1.0, reason="fixed_demo_signal"),
    consent_scope=ConsentScope(purposes=("state_estimation",), granted_at=now),
    retention=RetentionPolicy(tier=RetentionTier.SESSION, on_expiry=ExpiryAction.DELETE),
)
```

`build_demo_scenarios(now)` 返回严格三个 `DemoScenarioInput`：

- `insufficient-evidence`：空信号、空上下文，证据“电脑活动/未提供”和“日历上下文/未提供”。
- `long-meeting`：Moderate/Moderate 电脑信号，`ActivityContext(name="Meeting")`，90 分钟 busy Meeting 日历。
- `deep-focus`：High/Low 电脑信号，空活动与日历上下文。

所有时间均使用传入的同一个时区感知 `now`；函数开头拒绝无时区 datetime：

```python
if now.tzinfo is None or now.utcoffset() is None:
    raise ValueError("demo clock must be timezone-aware")
```

- [ ] **Step 4: 运行场景测试确认 Green**

Run: `uv run pytest tests/api/test_demo_scenarios.py -v`

Expected: PASS。

- [ ] **Step 5: 提交场景适配**

```bash
git add src/sense_engine/api/demo_scenarios.py tests/api/test_demo_scenarios.py
git commit -m "feat: add fixed SenseEngine demo scenarios"
```

### Task 4: 编排请求内三步状态循环

- [ ] **Step 1: 编写服务 Red 测试**

创建 `tests/api/test_demo_service.py`：

```python
from datetime import UTC, datetime

import pytest

from sense_engine.api.demo_service import DemoService


NOW = datetime(2026, 7, 15, 8, 0, tzinfo=UTC)


def test_demo_service_runs_fixed_loop_with_prewrite_baselines() -> None:
    response = DemoService(clock=lambda: NOW).run()

    assert tuple(step.baseline_before for step in response.steps) == pytest.approx(
        (0.5, 0.5, 0.7)
    )
    assert tuple(step.estimate.dimensions["cognitive_load"] for step in response.steps) == (
        0.5,
        0.9,
        0.55,
    )
    assert tuple(step.intervention.action.type for step in response.steps) == (
        "Ask",
        "Suggest Break",
        "Silence",
    )
    assert response.baseline_after == pytest.approx(0.65)


def test_demo_service_does_not_share_memory_across_runs() -> None:
    service = DemoService(clock=lambda: NOW)

    first = service.run()
    second = service.run()

    assert tuple(item.baseline_before for item in first.steps) == tuple(
        item.baseline_before for item in second.steps
    )
```

- [ ] **Step 2: 运行测试确认 Red**

Run: `uv run pytest tests/api/test_demo_service.py -v`

Expected: FAIL，因为 `DemoService` 不存在。

- [ ] **Step 3: 实现最小编排服务**

创建 `src/sense_engine/api/demo_service.py`：

```python
from collections.abc import Callable
from datetime import UTC, datetime

from sense_engine.api.demo_scenarios import build_demo_scenarios
from sense_engine.api.schemas import DemoRunResponse, DemoStep
from sense_engine.core.state_estimator import StateEstimator
from sense_engine.memory.state_memory import StateMemoryBank
from sense_engine.policy.intervention_policy import InterventionPolicy

Clock = Callable[[], datetime]


def utc_now() -> datetime:
    return datetime.now(tz=UTC)


class DemoService:
    def __init__(
        self,
        *,
        clock: Clock = utc_now,
        estimator: StateEstimator | None = None,
        policy: InterventionPolicy | None = None,
    ) -> None:
        self._clock = clock
        self._estimator = estimator or StateEstimator()
        self._policy = policy or InterventionPolicy()

    def run(self) -> DemoRunResponse:
        generated_at = self._clock()
        if generated_at.tzinfo is None or generated_at.utcoffset() is None:
            raise ValueError("demo clock must be timezone-aware")
        generated_at = generated_at.astimezone(UTC)
        memory = StateMemoryBank(clock=lambda: generated_at)
        steps: list[DemoStep] = []
        for item in build_demo_scenarios(generated_at):
            estimate = self._estimator.estimate(list(item.signal_events), item.context)
            baseline = memory.get_baseline()
            memory.save_event(estimate)
            intervention = self._policy.decide_action(estimate, baseline)
            steps.append(
                DemoStep(
                    scenario=item.scenario,
                    baseline_before=baseline,
                    estimate=estimate,
                    intervention=intervention,
                )
            )
        return DemoRunResponse(
            generated_at=generated_at,
            steps=(steps[0], steps[1], steps[2]),
            baseline_after=memory.get_baseline(),
        )
```

- [ ] **Step 4: 运行服务测试确认 Green**

Run: `uv run pytest tests/api/test_demo_service.py -v`

Expected: `2 passed`。

- [ ] **Step 5: 运行核心回归并提交**

Run: `uv run pytest tests/core tests/memory tests/policy tests/api/test_demo_service.py -v`

Expected: 全部通过。

```bash
git add src/sense_engine/api/demo_service.py tests/api/test_demo_service.py
git commit -m "feat: orchestrate isolated SenseEngine demo runs"
```

### Task 5: 添加认证、无请求体边界和全有或全无错误

- [ ] **Step 1: 编写 HTTP Red 测试**

扩展 `tests/api/test_app.py`，正常路径使用 `create_app(service=DemoService(clock=lambda: NOW))`，失败路径使用 `create_app(service=FailingDemoService())`，覆盖：

```python
def test_demo_requires_service_key() -> None:
    response = client.post("/v1/demo/run")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"


def test_demo_rejects_request_body() -> None:
    response = client.post(
        "/v1/demo/run",
        headers={"X-SenseEngine-Service-Key": "test-service-key"},
        json={"signal": "visitor-controlled"},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_request"


def test_demo_returns_complete_no_store_response() -> None:
    response = client.post(
        "/v1/demo/run",
        headers={"X-SenseEngine-Service-Key": "test-service-key"},
    )
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert [item["intervention"]["action"]["type"] for item in response.json()["steps"]] == [
        "Ask",
        "Suggest Break",
        "Silence",
    ]


def test_demo_hides_internal_failure() -> None:
    application = create_app(service=FailingDemoService())
    response = TestClient(application).post(
        "/v1/demo/run",
        headers={"X-SenseEngine-Service-Key": "test-service-key"},
    )
    assert response.status_code == 503
    assert response.json() == {
        "error": {
            "code": "demo_unavailable",
            "message": "SenseEngine demo is temporarily unavailable.",
        }
    }
    assert "traceback" not in response.text.casefold()
```

`FailingDemoService.run()` 必须只抛出 `RuntimeError("private upstream detail")`。

- [ ] **Step 2: 运行 HTTP 测试确认 Red**

Run: `uv run pytest tests/api/test_app.py -v`

Expected: 新增测试 FAIL，因为路由和认证尚未实现。

- [ ] **Step 3: 实现安全设置与恒定时间校验**

创建 `src/sense_engine/api/security.py`：

```python
import hmac
import os
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ApiSettings:
    service_key: str
    environment: str

    @classmethod
    def from_env(cls) -> "ApiSettings":
        key = os.environ.get("SENSE_ENGINE_SERVICE_KEY", "")
        if not key:
            raise RuntimeError("SENSE_ENGINE_SERVICE_KEY is required")
        return cls(service_key=key, environment=os.environ.get("SENSE_ENGINE_ENV", "development"))


def is_authorized(provided: str | None, expected: str) -> bool:
    candidate = provided or ""
    return hmac.compare_digest(candidate.encode(), expected.encode())
```

- [ ] **Step 4: 实现 POST 路由和错误边界**

把 `create_app` 改为接受 `settings: ApiSettings | None` 和 `service: DemoService | None`。POST 路由使用 `Request`、`Header`、`JSONResponse` 和 `response_model=DemoRunResponse`：

```python
@application.post("/v1/demo/run", response_model=DemoRunResponse)
async def run_demo(
    request: Request,
    service_key: Annotated[str | None, Header(alias="X-SenseEngine-Service-Key")] = None,
) -> DemoRunResponse | JSONResponse:
    if not is_authorized(service_key, resolved_settings.service_key):
        return error_response(401, "unauthorized", "Unauthorized.")
    if await request.body():
        return error_response(400, "invalid_request", "Request body is not allowed.")
    try:
        result = resolved_service.run()
    except Exception as error:
        logger.error("demo_run_failed type=%s", type(error).__name__)
        return error_response(
            503,
            "demo_unavailable",
            "SenseEngine demo is temporarily unavailable.",
        )
    return JSONResponse(content=result.model_dump(mode="json"), headers={"Cache-Control": "no-store"})
```

同文件定义 `error_response(status_code, code, message)`，统一返回 `JSONResponse` 并设置 `Cache-Control: no-store`。模块级 `app` 使用 `create_app()`；不得启用 CORS middleware。日志不得传 `exc_info=True`，不得记录请求头、请求体、响应体、私有 URL 或密钥。

- [ ] **Step 5: 运行 HTTP 测试确认 Green**

Run: `uv run pytest tests/api/test_app.py -v`

Expected: 全部通过。

- [ ] **Step 6: 运行安全静态检查并提交**

Run: `uv run mypy src tests`

Run: `uv run ruff check src tests`

Expected: 均退出码为 0。

```bash
git add src/sense_engine/api/app.py src/sense_engine/api/security.py tests/api/test_app.py
git commit -m "feat: expose authenticated SenseEngine demo API"
```

### Task 6: 导出并锁定 OpenAPI

- [ ] **Step 1: 编写导出 Red 测试**

创建 `tests/api/test_openapi_export.py`：

```python
import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_committed_openapi_matches_application(tmp_path: Path) -> None:
    output = tmp_path / "openapi.json"
    subprocess.run(
        [sys.executable, "scripts/export_openapi.py", str(output)],
        cwd=ROOT,
        check=True,
    )
    committed = json.loads((ROOT / "contracts/sense-engine-openapi.json").read_text())
    generated = json.loads(output.read_text())
    assert committed == generated


def test_committed_demo_fixture_matches_service(tmp_path: Path) -> None:
    output = tmp_path / "demo-response.json"
    subprocess.run(
        [sys.executable, "scripts/export_demo_fixture.py", str(output)],
        cwd=ROOT,
        check=True,
    )
    committed = json.loads((ROOT / "contracts/demo-response.json").read_text())
    generated = json.loads(output.read_text())
    assert committed == generated
```

- [ ] **Step 2: 运行测试确认 Red**

Run: `uv run pytest tests/api/test_openapi_export.py -v`

Expected: FAIL，因为导出脚本和契约文件不存在。

- [ ] **Step 3: 实现确定性导出脚本**

创建 `scripts/export_openapi.py`：

```python
import json
import sys
from pathlib import Path

from sense_engine.api.app import app


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: export_openapi.py OUTPUT")
    output = Path(sys.argv[1])
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(app.openapi(), ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
```

创建 `scripts/export_demo_fixture.py`：

```python
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

from sense_engine.api.demo_service import DemoService


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: export_demo_fixture.py OUTPUT")
    output = Path(sys.argv[1])
    output.parent.mkdir(parents=True, exist_ok=True)
    now = datetime(2026, 7, 15, 8, 0, tzinfo=UTC)
    response = DemoService(clock=lambda: now).run()
    output.write_text(
        json.dumps(response.model_dump(mode="json"), ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
```

Run: `SENSE_ENGINE_SERVICE_KEY=contract-test-key uv run python scripts/export_openapi.py contracts/sense-engine-openapi.json`

Run: `uv run python scripts/export_demo_fixture.py contracts/demo-response.json`

- [ ] **Step 4: 运行契约测试确认 Green**

Run: `uv run pytest tests/api/test_openapi_export.py -v`

Expected: `2 passed`。

- [ ] **Step 5: 运行 API 全量门禁**

Run: `uv run pytest tests/api -v`

Run: `uv run mypy src tests scripts/export_openapi.py scripts/export_demo_fixture.py`

Run: `uv run ruff check .`

Expected: 全部退出码为 0。

- [ ] **Step 6: 提交 OpenAPI**

```bash
git add scripts/export_openapi.py scripts/export_demo_fixture.py contracts/sense-engine-openapi.json contracts/demo-response.json tests/api/test_openapi_export.py
git commit -m "chore: publish SenseEngine OpenAPI contract"
```

### Task 7: API 阶段回归

- [ ] **Step 1: 运行全量 Python 门禁**

Run: `uv run pytest`

Run: `uv run mypy`

Run: `uv run ruff check .`

Expected: 全部退出码为 0。

- [ ] **Step 2: 本地启动并执行真实 HTTP 冒烟**

Run: `SENSE_ENGINE_SERVICE_KEY=local-demo-key uv run uvicorn sense_engine.api.app:app --host 127.0.0.1 --port 8000`

在另一个终端运行：

```bash
curl --fail --silent \
  -X POST \
  -H 'X-SenseEngine-Service-Key: local-demo-key' \
  http://127.0.0.1:8000/v1/demo/run
```

Expected: HTTP 200，JSON 中动作顺序为 Ask、Suggest Break、Silence。

- [ ] **Step 3: 检查工作树和差异**

Run: `git status --short`

Run: `git diff --check main...HEAD`

Expected: 工作树干净，差异检查退出码为 0。
