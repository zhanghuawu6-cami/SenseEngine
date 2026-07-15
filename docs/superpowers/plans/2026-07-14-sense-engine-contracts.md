# SenseEngine Core Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Initialize the Python `SenseEngine` package and implement the six type-safe Pydantic v2 contracts from Appendix A.1 of the SenseOrder whitepaper.

**Architecture:** The package uses a `src/` layout. `sense_engine.core.models` owns all cross-module contracts, while `adapters`, `memory`, `policy`, and `api` are importable boundaries with no business implementation. Shared constrained types and the strict base model are dependency roots; each Appendix A.1 contract lives in a focused module and is re-exported through one public package surface.

**Tech Stack:** Python 3.11+ (verified locally with the bundled Python 3.12.13 runtime), FastAPI, Pydantic v2, pytest, mypy, Ruff, Hatchling

---

### Task 1: Package skeleton and module boundaries

**Files:**
- Create: `SenseEngine/pyproject.toml`
- Create: `SenseEngine/README.md`
- Create: `SenseEngine/src/sense_engine/__init__.py`
- Create: `SenseEngine/src/sense_engine/core/__init__.py`
- Create: `SenseEngine/src/sense_engine/core/models/__init__.py`
- Create: `SenseEngine/src/sense_engine/adapters/__init__.py`
- Create: `SenseEngine/src/sense_engine/memory/__init__.py`
- Create: `SenseEngine/src/sense_engine/policy/__init__.py`
- Create: `SenseEngine/src/sense_engine/api/__init__.py`
- Create: `SenseEngine/tests/core/test_models.py`

- [ ] **Step 1: Create project metadata, README, and the package marker**

```toml
# SenseEngine/pyproject.toml
[build-system]
requires = ["hatchling>=1.27,<2"]
build-backend = "hatchling.build"

[project]
name = "sense-engine"
version = "0.1.0"
description = "SenseOrder State Computing core data contracts"
readme = "README.md"
requires-python = ">=3.11"
dependencies = [
  "fastapi>=0.116,<1",
  "pydantic>=2.11,<3",
]

[project.optional-dependencies]
dev = [
  "mypy>=1.16,<2",
  "pytest>=8.4,<9",
  "ruff>=0.12,<1",
]

[tool.hatch.build.targets.wheel]
packages = ["src/sense_engine"]

[tool.pytest.ini_options]
pythonpath = ["src"]
testpaths = ["tests"]
addopts = "-ra"

[tool.mypy]
python_version = "3.11"
strict = true
plugins = ["pydantic.mypy"]
files = ["src", "tests"]

[tool.ruff]
target-version = "py311"
line-length = 100

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B", "ANN"]
ignore = ["E501"]
```

````markdown
# SenseEngine

SenseEngine is the typed contract foundation for SenseOrder State Computing.
This initial version implements the six data structures defined by Appendix A.1
of the SenseOrder whitepaper, Core Data Contract v0.2.

## Modules

- `core`: shared Pydantic contracts
- `adapters`: signal ingress boundary
- `memory`: state memory boundary
- `policy`: intervention policy boundary
- `api`: service interface boundary

Only data structures are implemented in this phase. There are no inference,
storage, policy, intervention execution, or API route implementations.

## Development

Use Python 3.11 or newer:

```bash
python3.11 -m venv .venv
.venv/bin/python -m pip install -e '.[dev]'
.venv/bin/pytest
.venv/bin/mypy src tests
.venv/bin/ruff check .
```
````

```python
# SenseEngine/src/sense_engine/__init__.py
"""SenseEngine State Computing contracts."""

__version__ = "0.1.0"
```

- [ ] **Step 2: Create the virtual environment and install dependencies**

Run:

```bash
cd SenseEngine
/Users/woods/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m venv .venv
.venv/bin/python -m pip install -e '.[dev]'
```

Expected: editable installation succeeds with Python 3.12.13, satisfying the project's Python 3.11+ requirement.

- [ ] **Step 3: Write the failing module-boundary test**

```python
# SenseEngine/tests/core/test_models.py
from importlib import import_module

import pytest


@pytest.mark.parametrize(
    "module_name",
    [
        "sense_engine.core",
        "sense_engine.adapters",
        "sense_engine.memory",
        "sense_engine.policy",
        "sense_engine.api",
    ],
)
def test_required_module_boundary_is_importable(module_name: str) -> None:
    assert import_module(module_name) is not None
```

- [ ] **Step 4: Run the boundary test and verify RED**

Run: `.venv/bin/pytest tests/core/test_models.py -v`
Expected: the parametrized cases fail with `ModuleNotFoundError` for the required boundary modules because only the root package marker exists.

- [ ] **Step 5: Add the minimal package boundaries**

```python
# SenseEngine/src/sense_engine/core/__init__.py
"""Core State Computing contracts and shared types."""
```

```python
# SenseEngine/src/sense_engine/core/models/__init__.py
"""Pydantic models for the State Computing v0.2 contract."""
```

```python
# SenseEngine/src/sense_engine/adapters/__init__.py
"""Signal adapter boundary; implementations are outside the v0.2 contract scope."""
```

```python
# SenseEngine/src/sense_engine/memory/__init__.py
"""State memory boundary; persistence is outside the v0.2 contract scope."""
```

```python
# SenseEngine/src/sense_engine/policy/__init__.py
"""Intervention policy boundary; decision logic is outside the v0.2 contract scope."""
```

```python
# SenseEngine/src/sense_engine/api/__init__.py
"""API boundary; routes are outside the v0.2 contract scope."""
```

- [ ] **Step 6: Run the boundary test and verify it passes**

Run: `.venv/bin/pytest tests/core/test_models.py -v`
Expected: `5 passed`.

- [ ] **Step 7: Commit the package skeleton if the workspace is placed in a Git repository**

```bash
git add SenseEngine/pyproject.toml SenseEngine/src SenseEngine/tests
git commit -m "chore: initialize SenseEngine package"
```

If the workspace is still not a Git repository, record that fact and continue without creating a repository implicitly.

### Task 2: Strict base types and SignalEvent

**Files:**
- Create: `SenseEngine/src/sense_engine/core/models/base.py`
- Create: `SenseEngine/src/sense_engine/core/models/common.py`
- Create: `SenseEngine/src/sense_engine/core/models/signal_event.py`
- Modify: `SenseEngine/tests/core/test_models.py`

- [ ] **Step 1: Add failing SignalEvent contract tests**

Add these imports to the file's import section and append the tests below the existing test:

```python
from datetime import datetime, timezone

from pydantic import ValidationError

from sense_engine.core.models.signal_event import (
    ConsentScope,
    ExpiryAction,
    FeaturePayload,
    RetentionPolicy,
    RetentionTier,
    SignalEvent,
    SignalQuality,
    SignalSource,
)


NOW = datetime(2026, 7, 14, 8, 0, tzinfo=timezone.utc)


def make_signal_event() -> SignalEvent:
    return SignalEvent(
        time=NOW,
        source=SignalSource(adapter="microphone", device_id="device-01", modality="voice"),
        feature=FeaturePayload(name="speech_rate", value=3.2, unit="syllables_per_second"),
        quality=SignalQuality(score=0.92, completeness=0.98, reason=None),
        consent_scope=ConsentScope(
            purposes=("state_estimation",),
            granted_at=NOW,
            expires_at=None,
        ),
        retention=RetentionPolicy(
            tier=RetentionTier.EPHEMERAL,
            expires_at=NOW,
            on_expiry=ExpiryAction.DELETE,
        ),
    )


def test_signal_event_matches_appendix_a1_v02() -> None:
    assert set(SignalEvent.model_fields) == {
        "time",
        "source",
        "feature",
        "quality",
        "consent_scope",
        "retention",
    }


def test_signal_event_rejects_naive_time() -> None:
    event = make_signal_event()
    with pytest.raises(ValidationError):
        SignalEvent(
            time=datetime(2026, 7, 14, 8, 0),
            source=event.source,
            feature=event.feature,
            quality=event.quality,
            consent_scope=event.consent_scope,
            retention=event.retention,
        )


def test_contract_rejects_unknown_fields() -> None:
    payload = make_signal_event().model_dump()
    payload["raw_audio"] = "not-allowed"
    with pytest.raises(ValidationError):
        SignalEvent.model_validate(payload)


def test_probability_fields_are_strict_and_bounded() -> None:
    with pytest.raises(ValidationError):
        SignalQuality(score="0.92", completeness=1.0, reason=None)  # type: ignore[arg-type]
    with pytest.raises(ValidationError):
        SignalQuality(score=1.01, completeness=1.0, reason=None)
```

- [ ] **Step 2: Run the new tests and verify RED**

Run: `.venv/bin/pytest tests/core/test_models.py -v`
Expected: collection fails with `ModuleNotFoundError: sense_engine.core.models.signal_event`.

- [ ] **Step 3: Implement the strict base and common types**

```python
# SenseEngine/src/sense_engine/core/models/base.py
"""Shared configuration for immutable State Computing contracts."""

from pydantic import BaseModel, ConfigDict


class ContractModel(BaseModel):
    """Base for strict v0.2 contracts with unknown fields forbidden."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)
```

```python
# SenseEngine/src/sense_engine/core/models/common.py
"""Constrained scalar and JSON types shared by core contracts."""

from typing import Annotated, TypeAlias

from pydantic import Field, JsonValue, StringConstraints

NonEmptyStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
Probability = Annotated[float, Field(ge=0.0, le=1.0, allow_inf_nan=False)]
FiniteFloat = Annotated[float, Field(allow_inf_nan=False)]
NonNegativeInt = Annotated[int, Field(ge=0)]
JsonObject: TypeAlias = dict[str, JsonValue]
```

- [ ] **Step 4: Implement SignalEvent and its value objects**

```python
# SenseEngine/src/sense_engine/core/models/signal_event.py
"""SignalEvent contract for authorized, derived sensor features."""

from enum import StrEnum

from pydantic import AwareDatetime, Field, JsonValue

from .base import ContractModel
from .common import NonEmptyStr, Probability


class RetentionTier(StrEnum):
    """Storage lifetime class attached to a signal event."""

    EPHEMERAL = "ephemeral"
    SESSION = "session"
    PERSISTENT = "persistent"


class ExpiryAction(StrEnum):
    """Required treatment when the declared retention period ends."""

    DELETE = "delete"
    AGGREGATE = "aggregate"
    ANONYMIZE = "anonymize"


class SignalSource(ContractModel):
    """Traceable origin of a feature submitted by an adapter."""

    adapter: NonEmptyStr = Field(description="生成该特征的接入适配器名称。")
    device_id: NonEmptyStr = Field(description="产生信号的设备匿名标识，用于来源追踪。")
    modality: NonEmptyStr = Field(description="信号模态，例如语音、动作或环境传感。")


class FeaturePayload(ContractModel):
    """Derived feature value; raw media is not part of this contract."""

    name: NonEmptyStr = Field(description="供状态计算使用的派生特征名称。")
    value: JsonValue = Field(description="特征值，只允许可序列化的 JSON 数据。")
    unit: NonEmptyStr | None = Field(default=None, description="特征值的计量单位；无单位时为空。")


class SignalQuality(ContractModel):
    """Evidence quality metadata used to judge signal reliability."""

    score: Probability = Field(description="信号整体可用度，0 表示不可用，1 表示完全可靠。")
    completeness: Probability = Field(description="预期采样窗口内有效数据的完整比例。")
    reason: NonEmptyStr | None = Field(default=None, description="质量下降或异常的可解释原因。")


class ConsentScope(ContractModel):
    """Purposes and validity window authorized by the user."""

    purposes: tuple[NonEmptyStr, ...] = Field(
        min_length=1,
        description="用户授权该信号参与的状态计算目的集合。",
    )
    granted_at: AwareDatetime = Field(description="用户授权生效的带时区时间。")
    expires_at: AwareDatetime | None = Field(default=None, description="授权到期时间；无固定期限时为空。")


class RetentionPolicy(ContractModel):
    """Declarative retention metadata for data minimization."""

    tier: RetentionTier = Field(description="事件允许进入的保留层级。")
    expires_at: AwareDatetime | None = Field(default=None, description="事件必须结束保留的时间。")
    on_expiry: ExpiryAction = Field(description="保留期结束时必须采取的数据处理动作。")


class SignalEvent(ContractModel):
    """A time-aligned feature event with quality, consent, and retention metadata."""

    time: AwareDatetime = Field(description="特征在来源端成立的事件时间，用于时序对齐。")
    source: SignalSource = Field(description="信号的适配器、设备和模态来源。")
    feature: FeaturePayload = Field(description="状态计算所需的派生特征，不包含原始媒体。")
    quality: SignalQuality = Field(description="决定该证据在状态估计中可信程度的质量信息。")
    consent_scope: ConsentScope = Field(description="限定该信号可用于哪些状态计算目的的授权范围。")
    retention: RetentionPolicy = Field(description="限定该信号可保留多久以及到期如何处理的策略。")
```

- [ ] **Step 5: Run tests and verify GREEN**

Run: `.venv/bin/pytest tests/core/test_models.py -v`
Expected: all current tests pass.

- [ ] **Step 6: Commit if Git is available**

```bash
git add SenseEngine/src/sense_engine/core/models SenseEngine/tests/core/test_models.py
git commit -m "feat: define SignalEvent contract"
```

### Task 3: ContextSnapshot and StateEstimate

**Files:**
- Create: `SenseEngine/src/sense_engine/core/models/context_snapshot.py`
- Create: `SenseEngine/src/sense_engine/core/models/state_estimate.py`
- Modify: `SenseEngine/tests/core/test_models.py`

- [ ] **Step 1: Add failing field-set and boundary tests**

Add the imports to the file's import section and append the tests:

```python
from sense_engine.core.models.context_snapshot import ContextSnapshot
from sense_engine.core.models.state_estimate import StateEstimate


def test_context_snapshot_matches_appendix_a1_v02() -> None:
    assert set(ContextSnapshot.model_fields) == {
        "activity",
        "place",
        "calendar",
        "people",
        "environment",
    }


def test_state_estimate_matches_appendix_a1_v02() -> None:
    assert set(StateEstimate.model_fields) == {
        "dimensions",
        "distribution",
        "confidence",
        "missingness",
        "model_version",
    }


def test_state_estimate_rejects_out_of_range_probability() -> None:
    with pytest.raises(ValidationError):
        StateEstimate(
            dimensions={"cognitive_load": 0.7},
            distribution={"focused": 1.1},
            confidence=0.9,
            missingness={"voice": 0.0},
            model_version="state-model-0.2.0",
        )
```

- [ ] **Step 2: Run tests and verify RED**

Run: `.venv/bin/pytest tests/core/test_models.py -v`
Expected: collection fails because `context_snapshot` and `state_estimate` do not exist.

- [ ] **Step 3: Implement ContextSnapshot value objects and contract**

```python
# SenseEngine/src/sense_engine/core/models/context_snapshot.py
"""ContextSnapshot contract for external evidence around a state estimate."""

from pydantic import AwareDatetime, Field

from .base import ContractModel
from .common import JsonObject, NonEmptyStr, NonNegativeInt, Probability


class ActivityContext(ContractModel):
    """Current activity evidence without interpreting it as a mental state."""

    name: NonEmptyStr = Field(description="当前活动的语义名称。")
    confidence: Probability = Field(description="系统对活动识别结果的置信度。")
    source: NonEmptyStr = Field(description="活动信息的来源，例如日程或设备特征。")


class PlaceContext(ContractModel):
    """Privacy-preserving semantic place context."""

    category: NonEmptyStr = Field(description="地点的语义类别，不要求包含精确坐标。")
    confidence: Probability = Field(description="系统对地点类别识别结果的置信度。")
    source: NonEmptyStr = Field(description="地点信息的来源。")


class CalendarContext(ContractModel):
    """Calendar evidence relevant to the current estimation window."""

    event_type: NonEmptyStr = Field(description="日程事件类别，例如会议或专注时段。")
    starts_at: AwareDatetime = Field(description="日程事件开始的带时区时间。")
    ends_at: AwareDatetime = Field(description="日程事件结束的带时区时间。")
    busy: bool = Field(description="该日程是否占用用户时间。")


class PeopleContext(ContractModel):
    """Non-identifying social context around the user."""

    count: NonNegativeInt = Field(description="估计在场人数，不记录个人身份。")
    relationship_categories: tuple[NonEmptyStr, ...] = Field(
        description="在场人员与用户的关系类别集合。"
    )
    confidence: Probability = Field(description="系统对人员情境估计的置信度。")


class EnvironmentContext(ContractModel):
    """Environmental measurements available to state estimation."""

    captured_at: AwareDatetime = Field(description="环境快照采集的带时区时间。")
    features: JsonObject = Field(description="温度、光照、噪声等具名环境特征。")


class ContextSnapshot(ContractModel):
    """External context that informs but does not equal a user state."""

    activity: ActivityContext | None = Field(description="当前活动情境；不可用时明确为空。")
    place: PlaceContext | None = Field(description="当前地点情境；不可用时明确为空。")
    calendar: tuple[CalendarContext, ...] = Field(description="当前窗口相关的日程证据集合。")
    people: PeopleContext | None = Field(description="不包含个人身份的在场人员情境。")
    environment: EnvironmentContext | None = Field(description="影响状态判断的外部环境条件。")
```

- [ ] **Step 4: Implement StateEstimate**

```python
# SenseEngine/src/sense_engine/core/models/state_estimate.py
"""StateEstimate contract preserving uncertainty and missing evidence."""

from typing import Annotated

from pydantic import Field

from .base import ContractModel
from .common import FiniteFloat, NonEmptyStr, Probability

DimensionMap = Annotated[dict[NonEmptyStr, FiniteFloat], Field(min_length=1)]
DistributionMap = Annotated[dict[NonEmptyStr, Probability], Field(min_length=1)]
MissingnessMap = dict[NonEmptyStr, Probability]


class StateEstimate(ContractModel):
    """Probabilistic multidimensional estimate produced by a named model version."""

    dimensions: DimensionMap = Field(description="认知负荷等连续状态维度及其有限数值。")
    distribution: DistributionMap = Field(description="候选离散状态到概率的映射，保留模型不确定性。")
    confidence: Probability = Field(description="模型对本次整体状态估计可靠性的汇总置信度。")
    missingness: MissingnessMap = Field(description="各预期输入信号的缺失程度，用于解释降级状态。")
    model_version: NonEmptyStr = Field(description="生成本次估计的模型或规则版本。")
```

- [ ] **Step 5: Run tests and verify GREEN**

Run: `.venv/bin/pytest tests/core/test_models.py -v`
Expected: all current tests pass.

- [ ] **Step 6: Commit if Git is available**

```bash
git add SenseEngine/src/sense_engine/core/models SenseEngine/tests/core/test_models.py
git commit -m "feat: define context and state estimate contracts"
```

### Task 4: StateMemory

**Files:**
- Create: `SenseEngine/src/sense_engine/core/models/state_memory.py`
- Modify: `SenseEngine/tests/core/test_models.py`

- [ ] **Step 1: Add a failing StateMemory field-set test**

Add the import to the file's import section and append the test:

```python
from sense_engine.core.models.state_memory import StateMemory


def test_state_memory_matches_appendix_a1_v02() -> None:
    assert set(StateMemory.model_fields) == {
        "episode",
        "preference",
        "routine",
        "correction",
        "decay",
        "provenance",
    }
```

- [ ] **Step 2: Run the test and verify RED**

Run: `.venv/bin/pytest tests/core/test_models.py -v`
Expected: collection fails with `ModuleNotFoundError: sense_engine.core.models.state_memory`.

- [ ] **Step 3: Implement memory value objects and StateMemory**

```python
# SenseEngine/src/sense_engine/core/models/state_memory.py
"""StateMemory contract for portable episodic, preference, and routine evidence."""

from pydantic import AwareDatetime, Field, JsonValue

from .base import ContractModel
from .common import JsonObject, NonEmptyStr, Probability
from .context_snapshot import ContextSnapshot
from .state_estimate import StateEstimate


class EpisodeMemory(ContractModel):
    """A time-bounded state episode retained for later contextual recall."""

    id: NonEmptyStr = Field(description="情节记忆的稳定标识，用于纠正、引用和删除。")
    occurred_at: AwareDatetime = Field(description="该状态片段发生的带时区时间。")
    state: StateEstimate = Field(description="该片段中保存的状态估计。")
    context: ContextSnapshot | None = Field(description="该状态片段对应的外部情境；不可用时为空。")
    signal_event_ids: tuple[NonEmptyStr, ...] = Field(description="支撑该片段的信号事件标识集合。")


class PreferenceMemory(ContractModel):
    """Explicit or learned preference scoped to a state and action target."""

    id: NonEmptyStr = Field(description="偏好记忆的稳定标识。")
    state_scope: NonEmptyStr = Field(description="该偏好适用的状态或状态维度范围。")
    target: NonEmptyStr = Field(description="偏好所针对的行动、通道或参数。")
    value: JsonValue = Field(description="用户偏好的结构化值。")
    confidence: Probability = Field(description="现有证据对该偏好结论的支持程度。")
    updated_at: AwareDatetime = Field(description="偏好最近一次由授权证据更新的时间。")


class RoutineMemory(ContractModel):
    """Repeated temporal or contextual pattern observed for the user."""

    id: NonEmptyStr = Field(description="规律记忆的稳定标识。")
    name: NonEmptyStr = Field(description="可解释的规律名称。")
    pattern: JsonObject = Field(description="描述时间窗口、触发情境等内容的结构化模式。")
    confidence: Probability = Field(description="规律在历史观察中成立的置信度。")
    observed_count: int = Field(ge=1, description="支持该规律的独立观察次数。")
    updated_at: AwareDatetime = Field(description="规律最近一次重新评估的时间。")


class CorrectionMemory(ContractModel):
    """User correction to a state estimate or retained memory value."""

    id: NonEmptyStr = Field(description="纠正记录的稳定标识。")
    target_id: NonEmptyStr = Field(description="被纠正的状态估计或记忆标识。")
    corrected_at: AwareDatetime = Field(description="用户完成纠正的带时区时间。")
    original_value: JsonValue = Field(description="系统在纠正前持有的值。")
    corrected_value: JsonValue = Field(description="用户确认后的替代值。")
    reason: NonEmptyStr | None = Field(default=None, description="用户愿意提供的纠正原因。")


class DecayPolicy(ContractModel):
    """Stored decay metadata; it does not calculate a new memory weight."""

    policy_name: NonEmptyStr = Field(description="评估记忆活跃权重所使用的衰减策略名称。")
    weight: Probability = Field(description="最近一次评估得到的记忆活跃权重。")
    evaluated_at: AwareDatetime = Field(description="当前衰减权重的评估时间。")


class ProvenanceRecord(ContractModel):
    """Origin record supporting explanation, audit, and deletion."""

    source_type: NonEmptyStr = Field(description="来源类别，例如信号事件、模型输出或用户操作。")
    source_id: NonEmptyStr = Field(description="可追溯的来源对象标识。")
    recorded_at: AwareDatetime = Field(description="该来源被纳入记忆的带时区时间。")
    actor: NonEmptyStr = Field(description="写入该来源记录的用户、设备或服务主体。")


class StateMemory(ContractModel):
    """Portable state memory with correction, decay, and provenance metadata."""

    episode: tuple[EpisodeMemory, ...] = Field(description="具体时间发生的状态片段集合。")
    preference: tuple[PreferenceMemory, ...] = Field(description="特定状态下的用户偏好集合。")
    routine: tuple[RoutineMemory, ...] = Field(description="重复出现的时间或情境规律集合。")
    correction: tuple[CorrectionMemory, ...] = Field(description="用户对判断或记忆内容的纠正集合。")
    decay: DecayPolicy = Field(description="记忆活跃权重的声明式衰减元数据。")
    provenance: tuple[ProvenanceRecord, ...] = Field(description="支持解释、审计和删除的来源记录集合。")
```

- [ ] **Step 4: Run tests and verify GREEN**

Run: `.venv/bin/pytest tests/core/test_models.py -v`
Expected: all current tests pass.

- [ ] **Step 5: Commit if Git is available**

```bash
git add SenseEngine/src/sense_engine/core/models/state_memory.py SenseEngine/tests/core/test_models.py
git commit -m "feat: define StateMemory contract"
```

### Task 5: Intervention and Outcome

**Files:**
- Create: `SenseEngine/src/sense_engine/core/models/intervention.py`
- Create: `SenseEngine/src/sense_engine/core/models/outcome.py`
- Modify: `SenseEngine/tests/core/test_models.py`

- [ ] **Step 1: Add failing Appendix A.1 field-set tests**

Add the imports to the file's import section and append the tests:

```python
from sense_engine.core.models.intervention import Intervention
from sense_engine.core.models.outcome import Outcome


def test_intervention_matches_appendix_a1_v02() -> None:
    assert set(Intervention.model_fields) == {
        "objective",
        "action",
        "risk",
        "reversibility",
        "expected_effect",
    }


def test_outcome_matches_appendix_a1_v02() -> None:
    assert set(Outcome.model_fields) == {
        "accepted",
        "adjusted",
        "rejected",
        "self_report",
        "behavior_proxy",
    }
```

- [ ] **Step 2: Run tests and verify RED**

Run: `.venv/bin/pytest tests/core/test_models.py -v`
Expected: collection fails because `intervention` and `outcome` do not exist.

- [ ] **Step 3: Implement Intervention and its value objects**

```python
# SenseEngine/src/sense_engine/core/models/intervention.py
"""Intervention contract for explainable, risk-aware reversible actions."""

from enum import StrEnum

from pydantic import Field

from .base import ContractModel
from .common import FiniteFloat, JsonObject, NonEmptyStr


class RiskLevel(StrEnum):
    """Declared impact level of an intervention."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ActionSpec(ContractModel):
    """Declarative action description; construction does not execute it."""

    type: NonEmptyStr = Field(description="干预行动的语义类型。")
    channel: NonEmptyStr = Field(description="行动作用的终端或输出通道。")
    parameters: JsonObject = Field(description="行动所需的可序列化参数。")


class RiskAssessment(ContractModel):
    """Risk level and rationale attached before an action is considered."""

    level: RiskLevel = Field(description="行动潜在影响的风险等级。")
    rationale: NonEmptyStr = Field(description="风险等级的可解释依据。")


class Reversibility(ContractModel):
    """Information needed to understand whether and how an action can be undone."""

    is_reversible: bool = Field(description="该行动是否能恢复到执行前状态。")
    method: NonEmptyStr | None = Field(default=None, description="撤销行动的方法；不可逆时可为空。")
    recovery_seconds: float | None = Field(
        default=None,
        ge=0.0,
        allow_inf_nan=False,
        description="完成撤销并恢复所需的预计秒数。",
    )


class Intervention(ContractModel):
    """A proposed action tied to an objective, risk, and expected state effect."""

    objective: NonEmptyStr = Field(description="此次行动服务的用户目标。")
    action: ActionSpec = Field(description="行动类型、通道和参数的声明式描述。")
    risk: RiskAssessment = Field(description="行动的风险等级与依据。")
    reversibility: Reversibility = Field(description="行动是否可撤销以及如何恢复。")
    expected_effect: dict[NonEmptyStr, FiniteFloat] = Field(
        description="预期改变的状态维度及其方向或幅度。"
    )
```

- [ ] **Step 4: Implement Outcome and its value objects**

```python
# SenseEngine/src/sense_engine/core/models/outcome.py
"""Outcome contract separating explicit feedback from behavior proxies."""

from pydantic import AwareDatetime, Field, JsonValue

from .base import ContractModel
from .common import FiniteFloat, NonEmptyStr


class SelfReport(ContractModel):
    """User-provided assessment of state or intervention effect."""

    reported_at: AwareDatetime = Field(description="用户提供自我报告的带时区时间。")
    dimensions: dict[NonEmptyStr, FiniteFloat] = Field(description="用户主动报告的状态维度和值。")
    note: NonEmptyStr | None = Field(default=None, description="用户愿意补充的文字反馈。")


class BehaviorProxy(ContractModel):
    """Authorized observed behavior kept distinct from explicit feedback."""

    name: NonEmptyStr = Field(description="行为代理指标的名称。")
    observed_at: AwareDatetime = Field(description="行为代理被观察到的带时区时间。")
    value: JsonValue = Field(description="行为代理的可序列化观测值。")
    authorization_reference: NonEmptyStr = Field(description="允许采集该代理指标的授权引用。")


class Outcome(ContractModel):
    """Intervention feedback preserving explicit and proxy evidence separately."""

    accepted: bool = Field(description="用户是否按原方案接受干预。")
    adjusted: bool = Field(description="用户是否修改参数、时间或通道后接受干预。")
    rejected: bool = Field(description="用户是否明确拒绝或撤销干预。")
    self_report: SelfReport | None = Field(description="用户主动提供的状态或效果反馈。")
    behavior_proxy: tuple[BehaviorProxy, ...] = Field(description="授权范围内观察到的行为代理指标集合。")
```

- [ ] **Step 5: Run tests and verify GREEN**

Run: `.venv/bin/pytest tests/core/test_models.py -v`
Expected: all current tests pass.

- [ ] **Step 6: Commit if Git is available**

```bash
git add SenseEngine/src/sense_engine/core/models SenseEngine/tests/core/test_models.py
git commit -m "feat: define intervention and outcome contracts"
```

### Task 6: Public exports, schema documentation, and round-trip verification

**Files:**
- Modify: `SenseEngine/src/sense_engine/core/models/__init__.py`
- Modify: `SenseEngine/src/sense_engine/core/__init__.py`
- Modify: `SenseEngine/tests/core/test_models.py`

- [ ] **Step 1: Add failing public-export and schema-description tests**

Replace the accumulated import section with this Ruff-sorted block, then append the tests:

```python
from datetime import datetime, timezone
from importlib import import_module

import pytest
from pydantic import BaseModel, ValidationError

from sense_engine.core.models import (
    ContextSnapshot as PublicContextSnapshot,
    Intervention as PublicIntervention,
    Outcome as PublicOutcome,
    SignalEvent as PublicSignalEvent,
    StateEstimate as PublicStateEstimate,
    StateMemory as PublicStateMemory,
)
from sense_engine.core.models.context_snapshot import ContextSnapshot
from sense_engine.core.models.intervention import Intervention
from sense_engine.core.models.outcome import Outcome
from sense_engine.core.models.signal_event import (
    ConsentScope,
    ExpiryAction,
    FeaturePayload,
    RetentionPolicy,
    RetentionTier,
    SignalEvent,
    SignalQuality,
    SignalSource,
)
from sense_engine.core.models.state_estimate import StateEstimate
from sense_engine.core.models.state_memory import StateMemory


@pytest.mark.parametrize(
    "model",
    [
        PublicSignalEvent,
        PublicContextSnapshot,
        PublicStateEstimate,
        PublicStateMemory,
        PublicIntervention,
        PublicOutcome,
    ],
)
def test_every_contract_field_has_a_schema_description(model: type[BaseModel]) -> None:
    schema = model.model_json_schema()
    schema_nodes = [schema, *schema.get("$defs", {}).values()]
    field_schemas = [
        property_schema
        for schema_node in schema_nodes
        for property_schema in schema_node.get("properties", {}).values()
    ]
    assert field_schemas
    assert all(field_schema.get("description") for field_schema in field_schemas)


def test_signal_event_json_round_trip_is_lossless() -> None:
    event = make_signal_event()
    assert SignalEvent.model_validate_json(event.model_dump_json()) == event
```

- [ ] **Step 2: Run tests and verify RED**

Run: `.venv/bin/pytest tests/core/test_models.py -v`
Expected: import fails because the six public classes are not exported from `core.models`.

- [ ] **Step 3: Add the public model surface**

```python
# SenseEngine/src/sense_engine/core/models/__init__.py
"""Public Pydantic model surface for the State Computing v0.2 contract."""

from .context_snapshot import ContextSnapshot
from .intervention import Intervention
from .outcome import Outcome
from .signal_event import SignalEvent
from .state_estimate import StateEstimate
from .state_memory import StateMemory

__all__ = [
    "ContextSnapshot",
    "Intervention",
    "Outcome",
    "SignalEvent",
    "StateEstimate",
    "StateMemory",
]
```

```python
# SenseEngine/src/sense_engine/core/__init__.py
"""Core State Computing contracts and shared types."""

from .models import (
    ContextSnapshot,
    Intervention,
    Outcome,
    SignalEvent,
    StateEstimate,
    StateMemory,
)

__all__ = [
    "ContextSnapshot",
    "Intervention",
    "Outcome",
    "SignalEvent",
    "StateEstimate",
    "StateMemory",
]
```

- [ ] **Step 4: Run tests and verify GREEN**

Run: `.venv/bin/pytest tests/core/test_models.py -v`
Expected: all tests pass and every top-level v0.2 field has a JSON Schema description.

- [ ] **Step 5: Run the complete verification suite**

Run:

```bash
.venv/bin/pytest -v
.venv/bin/mypy src tests
.venv/bin/ruff check .
```

Expected:

- pytest: all tests pass.
- mypy: `Success: no issues found`.
- Ruff: `All checks passed!`.

- [ ] **Step 6: Audit scope and Appendix A.1 coverage**

Run:

```bash
rg -n "FastAPI\(|APIRouter\(|def (infer|predict|execute|save|load)" src
```

Expected: no matches, confirming that no API route or business behavior was added.

Review `SignalEvent`, `ContextSnapshot`, `StateEstimate`, `StateMemory`, `Intervention`, and `Outcome` field sets against the 32 fields asserted in `tests/core/test_models.py`.

- [ ] **Step 7: Commit the completed contract package if Git is available**

```bash
git add SenseEngine
git commit -m "feat: initialize SenseEngine v0.2 contracts"
```

If Git is unavailable, report the uncommitted filesystem result without initializing or altering repository ownership.
