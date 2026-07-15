# StateEstimator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `StateEstimate` to v0.3 and implement a deterministic, probabilistic, explainable rule-based `StateEstimator` with an injectable individual baseline.

**Architecture:** The contract upgrade adds a required non-empty explanation tuple while preserving the existing six-contract public export surface. `StateEstimator` remains a runtime service imported from its concrete module; it extracts the latest valid computer activity evidence, derives long-meeting context, applies an explicit Overload > Friction > Flow > Unknown priority, and builds normalized `StateEstimate` values through one shared output function.

**Tech Stack:** Python 3.11+, dataclasses, Pydantic v2 contracts, pytest, mypy strict, Ruff

---

### Task 1: StateEstimate v0.3 contract

**Files:**
- Modify: `src/sense_engine/core/models/state_estimate.py`
- Modify: `tests/core/test_models.py`

- [ ] **Step 1: Write failing v0.3 contract tests**

Rename `test_state_estimate_has_exact_v02_fields` and replace it with:

```python
def test_state_estimate_has_exact_v03_fields() -> None:
    """StateEstimate v0.3 adds an explainability field to Appendix A.1."""
    assert set(StateEstimate.model_fields) == {
        "dimensions",
        "distribution",
        "confidence",
        "missingness",
        "model_version",
        "explanation",
    }
```

Add these tests after the field-set test, before changing production code:

```python
def test_state_estimate_requires_explanation() -> None:
    """Every v0.3 estimate must include explicit explanatory evidence."""
    payload = make_state_estimate().model_dump()

    with pytest.raises(ValidationError) as error:
        StateEstimate.model_validate(payload)

    assert any(item["loc"] == ("explanation",) for item in error.value.errors())


@pytest.mark.parametrize(
    ("explanation", "expected_error_type"),
    [
        ((), "too_short"),
        (("   ",), "string_too_short"),
    ],
)
def test_state_estimate_rejects_empty_explanations(
    explanation: tuple[str, ...],
    expected_error_type: str,
) -> None:
    """Explanation tuples and their individual messages cannot be empty."""
    payload = make_state_estimate().model_dump()
    payload["explanation"] = explanation

    with pytest.raises(ValidationError) as error:
        StateEstimate.model_validate(payload)

    assert any(item["type"] == expected_error_type for item in error.value.errors())


def test_state_estimate_explanation_has_chinese_schema_description() -> None:
    """Explainability semantics remain visible in generated API schemas."""
    description = StateEstimate.model_fields["explanation"].description

    assert description is not None
    assert "解释" in description
    assert "证据" in description
```

- [ ] **Step 2: Run focused contract tests and verify RED**

Run:

```bash
PYTHONDONTWRITEBYTECODE=1 .venv/bin/pytest -p no:cacheprovider \
  tests/core/test_models.py -k 'state_estimate_has_exact_v03 or state_estimate_requires_explanation or state_estimate_rejects_empty_explanations or state_estimate_explanation_has_chinese' -v
```

Expected: the field-set test fails because `explanation` is absent; the required test fails because the old model accepts payloads without explanation; the schema-description test fails because the field does not exist.

- [ ] **Step 3: Implement the v0.3 field**

Replace `src/sense_engine/core/models/state_estimate.py` with:

```python
"""Typed State Computing estimate contracts."""

from typing import Annotated

from pydantic import Field

from sense_engine.core.models.base import ContractModel
from sense_engine.core.models.common import FiniteFloat, NonEmptyStr, Probability

DimensionMap = Annotated[dict[NonEmptyStr, FiniteFloat], Field(min_length=1)]
DistributionMap = Annotated[dict[NonEmptyStr, Probability], Field(min_length=1)]
MissingnessMap = dict[NonEmptyStr, Probability]
ExplanationList = Annotated[tuple[NonEmptyStr, ...], Field(min_length=1)]


class StateEstimate(ContractModel):
    """Represent a v0.3 state result with uncertainty and evidence."""

    dimensions: DimensionMap = Field(
        description="连续状态维度及其有限数值，例如认知负荷，用于表达 State Computing 的多维估计结果。"
    )
    distribution: DistributionMap = Field(
        description="候选状态及其概率分布，保留不同状态之间的不确定性，不要求将候选概率强制归一化。"
    )
    confidence: Probability = Field(
        description="本次状态估计的总体可信度，反映结果整体可靠性，并与任一候选类别的概率明确区分。"
    )
    missingness: MissingnessMap = Field(
        description="各类输入的缺失程度，用于解释因证据不完整而降级的状态估计及其可信度。"
    )
    model_version: NonEmptyStr = Field(
        description="生成该估计的模型或规则版本，用于复现、追溯并比较 State Computing 结果。"
    )
    explanation: ExplanationList = Field(
        description="支持本次概率估计的人类可读主要证据与解释，用于建立用户信任并支持审计。"
    )
```

- [ ] **Step 4: Update the existing valid test factory**

Update `make_state_estimate()` in `tests/core/test_models.py`:

```python
def make_state_estimate() -> StateEstimate:
    """Build a valid v0.3 state estimate with explanatory evidence."""
    return StateEstimate(
        dimensions={"cognitive_load": 0.62},
        distribution={"focused": 0.55, "fatigued": 0.20},
        confidence=0.71,
        missingness={"calendar": 0.40},
        model_version="state-rules-v0.2",
        explanation=("Synthetic evidence for contract testing.",),
    )
```

Modify `test_state_estimate_requires_explanation()` so it removes the now-valid field:

```python
def test_state_estimate_requires_explanation() -> None:
    """Every v0.3 estimate must include explicit explanatory evidence."""
    payload = make_state_estimate().model_dump()
    payload.pop("explanation")

    with pytest.raises(ValidationError) as error:
        StateEstimate.model_validate(payload)

    assert any(item["loc"] == ("explanation",) for item in error.value.errors())
```

- [ ] **Step 5: Run contract and full regression tests and verify GREEN**

Run:

```bash
PYTHONDONTWRITEBYTECODE=1 .venv/bin/pytest -p no:cacheprovider tests/core/test_models.py -q
PYTHONDONTWRITEBYTECODE=1 .venv/bin/pytest -p no:cacheprovider -q
```

Expected: all contract tests pass; the six public contract exports remain unchanged; the full suite passes.

- [ ] **Step 6: Commit the contract upgrade**

```bash
git add src/sense_engine/core/models/state_estimate.py tests/core/test_models.py
git commit -m "feat: add StateEstimate explanations"
```

### Task 2: Rule-based StateEstimator

**Files:**
- Create: `src/sense_engine/core/state_estimator.py`
- Create: `tests/core/test_state_estimator.py`

- [ ] **Step 1: Write failing rule-engine tests**

```python
# tests/core/test_state_estimator.py
"""Tests for probabilistic and explainable rule-based state estimation."""

from datetime import UTC, datetime, timedelta

import pytest

from sense_engine.core.models.common import FiniteJsonValue
from sense_engine.core.models.context_snapshot import (
    ActivityContext,
    CalendarContext,
    ContextSnapshot,
)
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
from sense_engine.core.state_estimator import StateBaseline, StateEstimator

NOW = datetime(2026, 7, 15, 10, 0, tzinfo=UTC)


def make_computer_event(
    value: FiniteJsonValue,
    *,
    event_time: datetime = NOW,
) -> SignalEvent:
    """Build an authorized computer activity event for estimator tests."""
    return SignalEvent(
        time=event_time,
        source=SignalSource(
            adapter="computer_activity_adapter",
            device_id="device-pseudonym-001",
            modality="computer_activity",
        ),
        feature=FeaturePayload(
            name="computer_activity_snapshot",
            value=value,
            unit=None,
        ),
        quality=SignalQuality(
            score=0.85,
            completeness=1.0,
            reason="simulated_complete_snapshot",
        ),
        consent_scope=ConsentScope(
            purposes=("state_estimation",),
            granted_at=NOW,
        ),
        retention=RetentionPolicy(
            tier=RetentionTier.SESSION,
            on_expiry=ExpiryAction.DELETE,
        ),
    )


def computer_value(typing_speed: str, mouse_frequency: str) -> FiniteJsonValue:
    """Build the minimal composite value used by estimator rules."""
    return {
        "schema_version": "1.0",
        "active_window": "VS Code",
        "typing_speed": typing_speed,
        "mouse_movement_frequency": mouse_frequency,
    }


def make_context(
    *,
    activity_name: str | None = None,
    meeting_minutes: float | None = None,
) -> ContextSnapshot:
    """Build explicit activity and meeting context for rule tests."""
    activity = (
        ActivityContext(name=activity_name, confidence=0.95, source="test")
        if activity_name is not None
        else None
    )
    calendar = (
        (
            CalendarContext(
                event_type="Meeting",
                starts_at=NOW,
                ends_at=NOW + timedelta(minutes=meeting_minutes),
                busy=True,
            ),
        )
        if meeting_minutes is not None
        else ()
    )
    return ContextSnapshot(
        activity=activity,
        place=None,
        calendar=calendar,
        people=None,
        environment=None,
    )


def test_high_typing_and_low_mouse_produce_flow_distribution() -> None:
    estimate = StateEstimator().estimate(
        [make_computer_event(computer_value("High", "Low"))],
        make_context(),
    )

    assert isinstance(estimate, StateEstimate)
    assert estimate.distribution["flow"] == 0.85
    assert max(estimate.distribution, key=estimate.distribution.__getitem__) == "flow"
    assert estimate.confidence == 0.85
    assert estimate.dimensions == {"cognitive_load": 0.55}
    assert estimate.explanation == (
        "High typing speed combined with low mouse movement indicates deep focus.",
    )


def test_low_typing_and_high_mouse_produce_friction_distribution() -> None:
    estimate = StateEstimator().estimate(
        [make_computer_event(computer_value("Low", "High"))],
        make_context(),
    )

    assert estimate.distribution["friction"] == 0.70
    assert max(estimate.distribution, key=estimate.distribution.__getitem__) == "friction"
    assert estimate.confidence == 0.70
    assert estimate.dimensions == {"cognitive_load": 0.65}
    assert "interaction friction" in estimate.explanation[0]


def test_long_meeting_produces_cognitive_overload_distribution() -> None:
    estimate = StateEstimator().estimate(
        [make_computer_event(computer_value("Moderate", "Moderate"))],
        make_context(activity_name="Meeting", meeting_minutes=90),
    )

    assert estimate.distribution["cognitive_overload"] == 0.80
    assert max(estimate.distribution, key=estimate.distribution.__getitem__) == (
        "cognitive_overload"
    )
    assert estimate.confidence == 0.80
    assert estimate.dimensions == {"cognitive_load": 0.90}
    assert estimate.explanation == (
        "Meeting duration of 90 minutes exceeds the 60-minute baseline.",
    )


def test_overload_has_priority_when_flow_and_long_meeting_both_match() -> None:
    estimate = StateEstimator().estimate(
        [make_computer_event(computer_value("High", "Low"))],
        make_context(activity_name="Meeting", meeting_minutes=90),
    )

    assert estimate.distribution["cognitive_overload"] == 0.80
    assert estimate.distribution["flow"] == 0.05
    assert estimate.confidence == 0.80


@pytest.mark.parametrize("events", [[], [make_computer_event("malformed")]])
def test_missing_or_malformed_signals_degrade_to_low_confidence_unknown(
    events: list[SignalEvent],
) -> None:
    estimate = StateEstimator().estimate(events, make_context())

    assert estimate.distribution["unknown"] == 0.40
    assert max(estimate.distribution, key=estimate.distribution.__getitem__) == "unknown"
    assert estimate.confidence == 0.40
    assert estimate.missingness == {
        "computer_activity": 1.0,
        "calendar_context": 1.0,
    }
    assert estimate.explanation == (
        "Available evidence does not strongly support a specific state.",
    )


def test_latest_valid_computer_event_controls_the_rule_result() -> None:
    old_flow = make_computer_event(
        computer_value("High", "Low"),
        event_time=NOW - timedelta(minutes=5),
    )
    new_friction = make_computer_event(
        computer_value("Low", "High"),
        event_time=NOW,
    )

    estimate = StateEstimator().estimate([new_friction, old_flow], make_context())

    assert estimate.distribution["friction"] == 0.70


def test_custom_baseline_changes_the_meeting_overload_threshold() -> None:
    estimator = StateEstimator(StateBaseline(meeting_overload_minutes=120.0))

    estimate = estimator.estimate(
        [make_computer_event(computer_value("Moderate", "Moderate"))],
        make_context(activity_name="Meeting", meeting_minutes=90),
    )

    assert estimate.distribution["unknown"] == 0.40
    assert estimate.confidence == 0.40


@pytest.mark.parametrize(
    ("events", "context"),
    [
        (
            [make_computer_event(computer_value("High", "Low"))],
            make_context(),
        ),
        (
            [make_computer_event(computer_value("Low", "High"))],
            make_context(),
        ),
        (
            [make_computer_event(computer_value("Moderate", "Moderate"))],
            make_context(activity_name="Meeting", meeting_minutes=90),
        ),
        ([], make_context()),
    ],
    ids=["flow", "friction", "overload", "unknown"],
)
def test_every_rule_distribution_sums_to_exactly_one(
    events: list[SignalEvent],
    context: ContextSnapshot,
) -> None:
    estimate = StateEstimator().estimate(events, context)

    assert sum(estimate.distribution.values()) == 1.0
    assert estimate.model_version == "state-estimator-rules-v0.1"
```

- [ ] **Step 2: Run estimator tests and verify RED**

Run:

```bash
PYTHONDONTWRITEBYTECODE=1 .venv/bin/pytest -p no:cacheprovider tests/core/test_state_estimator.py -v
```

Expected: test collection fails with `ModuleNotFoundError: No module named 'sense_engine.core.state_estimator'`.

- [ ] **Step 3: Implement the minimal rule engine**

```python
# src/sense_engine/core/state_estimator.py
"""Probabilistic and explainable rule-based state estimation."""

from dataclasses import dataclass
from datetime import datetime
from typing import Final

from sense_engine.core.models.context_snapshot import ContextSnapshot
from sense_engine.core.models.signal_event import SignalEvent
from sense_engine.core.models.state_estimate import StateEstimate

MODEL_VERSION: Final = "state-estimator-rules-v0.1"


@dataclass(frozen=True, slots=True)
class StateBaseline:
    """Individual comparison values used by the first rule engine."""

    flow_typing_speed: str = "High"
    flow_mouse_movement_frequency: str = "Low"
    friction_typing_speed: str = "Low"
    friction_mouse_movement_frequency: str = "High"
    meeting_overload_minutes: float = 60.0


@dataclass(frozen=True, slots=True)
class _ComputerActivity:
    """Validated subset of a composite computer activity event."""

    typing_speed: str
    mouse_movement_frequency: str


class StateEstimator:
    """Apply ordered rules and return probability-first state estimates."""

    def __init__(self, baseline: StateBaseline | None = None) -> None:
        self._baseline = baseline if baseline is not None else StateBaseline()

    def estimate(
        self,
        signal_events: list[SignalEvent],
        context: ContextSnapshot,
    ) -> StateEstimate:
        """Estimate a state distribution from signal and context evidence."""
        computer_activity = self._latest_computer_activity(signal_events)
        meeting_minutes = self._longest_meeting_minutes(context)
        missingness = {
            "computer_activity": 0.0 if computer_activity is not None else 1.0,
            "calendar_context": 0.0 if meeting_minutes is not None else 1.0,
        }

        if self._is_long_meeting(context, meeting_minutes):
            assert meeting_minutes is not None
            explanation = (
                f"Meeting duration of {meeting_minutes:g} minutes exceeds the "
                f"{self._baseline.meeting_overload_minutes:g}-minute baseline."
            )
            return self._build_estimate(
                probabilities=(0.05, 0.05, 0.80),
                confidence=0.80,
                cognitive_load=0.90,
                explanation=explanation,
                missingness=missingness,
            )

        if computer_activity is not None and self._is_friction(computer_activity):
            return self._build_estimate(
                probabilities=(0.10, 0.70, 0.10),
                confidence=0.70,
                cognitive_load=0.65,
                explanation=(
                    "Low typing speed combined with high mouse movement indicates "
                    "interaction friction."
                ),
                missingness=missingness,
            )

        if computer_activity is not None and self._is_flow(computer_activity):
            return self._build_estimate(
                probabilities=(0.85, 0.05, 0.05),
                confidence=0.85,
                cognitive_load=0.55,
                explanation=(
                    "High typing speed combined with low mouse movement indicates "
                    "deep focus."
                ),
                missingness=missingness,
            )

        return self._build_estimate(
            probabilities=(0.20, 0.20, 0.20),
            confidence=0.40,
            cognitive_load=0.50,
            explanation=(
                "Available evidence does not strongly support a specific state."
            ),
            missingness=missingness,
        )

    def _is_flow(self, activity: _ComputerActivity) -> bool:
        return (
            activity.typing_speed == self._baseline.flow_typing_speed
            and activity.mouse_movement_frequency
            == self._baseline.flow_mouse_movement_frequency
        )

    def _is_friction(self, activity: _ComputerActivity) -> bool:
        return (
            activity.typing_speed == self._baseline.friction_typing_speed
            and activity.mouse_movement_frequency
            == self._baseline.friction_mouse_movement_frequency
        )

    def _is_long_meeting(
        self,
        context: ContextSnapshot,
        meeting_minutes: float | None,
    ) -> bool:
        return (
            context.activity is not None
            and context.activity.name.casefold() == "meeting"
            and meeting_minutes is not None
            and meeting_minutes > self._baseline.meeting_overload_minutes
        )

    @staticmethod
    def _latest_computer_activity(
        signal_events: list[SignalEvent],
    ) -> _ComputerActivity | None:
        valid_events: list[tuple[datetime, _ComputerActivity]] = []
        for event in signal_events:
            if event.feature.name != "computer_activity_snapshot":
                continue
            value = event.feature.value
            if not isinstance(value, dict):
                continue
            typing_speed = value.get("typing_speed")
            mouse_frequency = value.get("mouse_movement_frequency")
            if not isinstance(typing_speed, str) or not isinstance(mouse_frequency, str):
                continue
            valid_events.append(
                (
                    event.time,
                    _ComputerActivity(
                        typing_speed=typing_speed,
                        mouse_movement_frequency=mouse_frequency,
                    ),
                )
            )
        if not valid_events:
            return None
        return max(valid_events, key=lambda item: item[0])[1]

    @staticmethod
    def _longest_meeting_minutes(context: ContextSnapshot) -> float | None:
        durations = [
            (item.ends_at - item.starts_at).total_seconds() / 60.0
            for item in context.calendar
            if item.event_type.casefold() == "meeting"
            and item.busy
            and item.ends_at > item.starts_at
        ]
        return max(durations) if durations else None

    @staticmethod
    def _build_estimate(
        *,
        probabilities: tuple[float, float, float],
        confidence: float,
        cognitive_load: float,
        explanation: str,
        missingness: dict[str, float],
    ) -> StateEstimate:
        flow, friction, cognitive_overload = probabilities
        unknown = 1.0 - sum(probabilities)
        return StateEstimate(
            dimensions={"cognitive_load": cognitive_load},
            distribution={
                "flow": flow,
                "friction": friction,
                "cognitive_overload": cognitive_overload,
                "unknown": unknown,
            },
            confidence=confidence,
            missingness=missingness,
            model_version=MODEL_VERSION,
            explanation=(explanation,),
        )
```

- [ ] **Step 4: Run estimator tests and verify GREEN**

Run:

```bash
PYTHONDONTWRITEBYTECODE=1 .venv/bin/pytest -p no:cacheprovider tests/core/test_state_estimator.py -v
```

Expected: all estimator rule, priority, fallback, baseline, latest-event, and exact-sum tests pass.

- [ ] **Step 5: Refactor only while tests remain green**

Review the implementation for duplicated estimate construction, hidden absolute-label output, mutation, and forbidden persistence or policy behavior. Keep `_build_estimate` as the single `StateEstimate` construction point and do not add abstractions beyond the approved baseline and evidence value object.

Run again:

```bash
PYTHONDONTWRITEBYTECODE=1 .venv/bin/pytest -p no:cacheprovider tests/core/test_state_estimator.py -q
```

Expected: all estimator tests remain green.

- [ ] **Step 6: Commit the rule engine**

```bash
git add src/sense_engine/core/state_estimator.py tests/core/test_state_estimator.py
git commit -m "feat: add probabilistic state estimator"
```

### Task 3: Full verification and scope audit

**Files:**
- Verify: `src/sense_engine/core/models/state_estimate.py`
- Verify: `src/sense_engine/core/state_estimator.py`
- Verify: `tests/core/test_models.py`
- Verify: `tests/core/test_state_estimator.py`

- [ ] **Step 1: Run the complete test suite without project caches**

```bash
PYTHONDONTWRITEBYTECODE=1 .venv/bin/pytest -p no:cacheprovider -q
```

Expected: all pre-existing 247 tests and all new v0.3 and estimator tests pass.

- [ ] **Step 2: Run strict type and lint checks**

```bash
.venv/bin/mypy --cache-dir=/tmp/senseengine-state-estimator-mypy src tests
.venv/bin/ruff check --no-cache .
```

Expected: mypy reports no issues and Ruff reports `All checks passed!`.

- [ ] **Step 3: Audit exact scope and contract exports**

```bash
rg -n 'sql|sqlite|database|persist|save\(|APIRouter|FastAPI\(|intervention|policy' \
  src/sense_engine/core/state_estimator.py
git diff --name-status main...HEAD
git status --short --branch
```

Expected: scope search has no matches; the feature diff is limited to the v0.3 model, core contract tests, estimator, estimator tests, and implementation plan; worktree is clean. No `CalendarAdapter`, persistence, training, or policy code exists.
