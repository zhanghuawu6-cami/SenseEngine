# State Memory and Intervention Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build deterministic in-process state memory baselines and a calm, risk-aware intervention policy without changing any core data contract.

**Architecture:** `StateMemoryBank` stores private timestamped runtime entries behind an injectable timezone-aware clock and computes an inclusive recent-window average with a neutral cold-start fallback. `InterventionPolicy` applies Low Confidence > Cognitive Overload > Silence priority and maps each decision into the existing complete `Intervention` contract through immutable decision specifications.

**Tech Stack:** Python 3.11+, dataclasses, Pydantic v2 contracts, pytest, mypy strict, Ruff

---

### Task 1: StateMemoryBank runtime service

**Files:**
- Create: `src/sense_engine/memory/state_memory.py`
- Create: `tests/memory/test_state_memory.py`

- [ ] **Step 1: Write all failing memory tests**

Create `tests/memory/test_state_memory.py`:

```python
"""Tests for the in-process StateMemoryBank runtime service."""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import cast

import pytest

from sense_engine.core.models.state_estimate import StateEstimate
from sense_engine.memory.state_memory import StateMemoryBank

NOW = datetime(2026, 7, 15, 12, 0, tzinfo=UTC)


@dataclass
class FakeClock:
    """Return a caller-controlled time for deterministic window tests."""

    current: datetime

    def __call__(self) -> datetime:
        return self.current


def make_estimate(cognitive_load: float | None = 0.5) -> StateEstimate:
    """Build a valid estimate with optional cognitive-load evidence."""
    dimensions = (
        {"cognitive_load": cognitive_load}
        if cognitive_load is not None
        else {"engagement": 0.5}
    )
    return StateEstimate(
        dimensions=dimensions,
        distribution={"flow": 0.5, "unknown": 0.5},
        confidence=0.8,
        missingness={},
        model_version="memory-test-v0.1",
        explanation=("Synthetic estimate for memory tests.",),
    )


def test_empty_window_returns_neutral_baseline() -> None:
    bank = StateMemoryBank(clock=FakeClock(NOW))

    assert bank.get_baseline() == 0.5


def test_baseline_averages_only_entries_inside_the_window() -> None:
    clock = FakeClock(NOW - timedelta(minutes=70))
    bank = StateMemoryBank(clock=clock)
    bank.save_event(make_estimate(0.9))
    clock.current = NOW - timedelta(minutes=40)
    bank.save_event(make_estimate(0.4))
    clock.current = NOW - timedelta(minutes=10)
    bank.save_event(make_estimate(0.8))
    clock.current = NOW

    assert bank.get_baseline(window_minutes=60) == pytest.approx(0.6)


def test_window_includes_cutoff_and_excludes_future_entries() -> None:
    clock = FakeClock(NOW - timedelta(minutes=60))
    bank = StateMemoryBank(clock=clock)
    bank.save_event(make_estimate(0.4))
    clock.current = NOW + timedelta(minutes=1)
    bank.save_event(make_estimate(0.9))
    clock.current = NOW

    assert bank.get_baseline(window_minutes=60) == 0.4


@pytest.mark.parametrize(
    "dirty_value",
    [True, "not-a-number", float("inf"), float("nan")],
    ids=["boolean", "string", "infinite", "nan"],
)
def test_baseline_skips_dirty_cognitive_load_values(dirty_value: object) -> None:
    bank = StateMemoryBank(clock=FakeClock(NOW))
    dirty_estimate = make_estimate(0.9)
    dirty_estimate.dimensions["cognitive_load"] = cast(float, dirty_value)
    bank.save_event(dirty_estimate)

    assert bank.get_baseline() == 0.5


def test_baseline_skips_estimates_without_cognitive_load() -> None:
    bank = StateMemoryBank(clock=FakeClock(NOW))
    bank.save_event(make_estimate(cognitive_load=None))

    assert bank.get_baseline() == 0.5


@pytest.mark.parametrize("window_minutes", [0, -1])
def test_baseline_rejects_non_positive_windows(window_minutes: int) -> None:
    bank = StateMemoryBank(clock=FakeClock(NOW))

    with pytest.raises(ValueError, match="window_minutes must be positive"):
        bank.get_baseline(window_minutes=window_minutes)


def test_save_event_rejects_naive_clock_values() -> None:
    bank = StateMemoryBank(clock=FakeClock(NOW.replace(tzinfo=None)))

    with pytest.raises(ValueError, match="timezone-aware"):
        bank.save_event(make_estimate())


def test_get_baseline_rejects_naive_clock_values() -> None:
    clock = FakeClock(NOW)
    bank = StateMemoryBank(clock=clock)
    bank.save_event(make_estimate())
    clock.current = NOW.replace(tzinfo=None)

    with pytest.raises(ValueError, match="timezone-aware"):
        bank.get_baseline()
```

- [ ] **Step 2: Run memory tests and verify RED**

Run:

```bash
PYTHONDONTWRITEBYTECODE=1 .venv/bin/pytest -p no:cacheprovider \
  tests/memory/test_state_memory.py -v
```

Expected: test collection fails with `ModuleNotFoundError: No module named 'sense_engine.memory.state_memory'`. This proves the new runtime service is absent before production code is written.

- [ ] **Step 3: Implement the minimal StateMemoryBank**

Create `src/sense_engine/memory/state_memory.py`:

```python
"""In-process state memory and individual-baseline calculation."""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from math import isfinite
from typing import Final

from sense_engine.core.models.state_estimate import StateEstimate

Clock = Callable[[], datetime]
DEFAULT_BASELINE: Final = 0.5


def _utc_now() -> datetime:
    """Return the current timezone-aware UTC time."""
    return datetime.now(tz=UTC)


@dataclass(frozen=True, slots=True)
class _MemoryEntry:
    """Pair one runtime estimate with its memory write time."""

    recorded_at: datetime
    estimate: StateEstimate


class StateMemoryBank:
    """Store state estimates in process and calculate recent baselines."""

    def __init__(self, *, clock: Clock | None = None) -> None:
        self._clock = clock if clock is not None else _utc_now
        self._entries: list[_MemoryEntry] = []

    def save_event(self, estimate: StateEstimate) -> None:
        """Store an estimate with the current injected-clock time."""
        self._entries.append(
            _MemoryEntry(recorded_at=self._now(), estimate=estimate)
        )

    def get_baseline(self, window_minutes: int = 60) -> float:
        """Return average recent cognitive load or a neutral cold-start value."""
        if window_minutes <= 0:
            raise ValueError("window_minutes must be positive")

        now = self._now()
        cutoff = now - timedelta(minutes=window_minutes)
        loads: list[float] = []
        for entry in self._entries:
            if not cutoff <= entry.recorded_at <= now:
                continue
            load = self._cognitive_load(entry.estimate)
            if load is not None:
                loads.append(load)
        return sum(loads) / len(loads) if loads else DEFAULT_BASELINE

    def _now(self) -> datetime:
        current = self._clock()
        if current.tzinfo is None or current.utcoffset() is None:
            raise ValueError("clock must return a timezone-aware datetime")
        return current

    @staticmethod
    def _cognitive_load(estimate: StateEstimate) -> float | None:
        value: object = estimate.dimensions.get("cognitive_load")
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return None
        load = float(value)
        return load if isfinite(load) else None
```

- [ ] **Step 4: Run memory tests and verify GREEN**

Run:

```bash
PYTHONDONTWRITEBYTECODE=1 .venv/bin/pytest -p no:cacheprovider \
  tests/memory/test_state_memory.py -v
```

Expected: all 12 collected memory cases pass, covering cold start, 70-minute exclusion, averaging, inclusive cutoff, future exclusion, dirty data, missing evidence, invalid windows, and naive clocks.

- [ ] **Step 5: Refactor while memory tests stay green**

Review `StateMemoryBank` for duplicate clock reads, input mutation, storage beyond the in-memory list, or coupling to `core.models.StateMemory`. Keep `_now()` as the only timezone validator and `_cognitive_load()` as the only dirty-value filter. Do not add package exports, persistence abstractions, or retention behavior.

Run:

```bash
PYTHONDONTWRITEBYTECODE=1 .venv/bin/pytest -p no:cacheprovider \
  tests/memory/test_state_memory.py -q
.venv/bin/mypy --cache-dir=/tmp/senseengine-memory-mypy \
  src/sense_engine/memory/state_memory.py tests/memory/test_state_memory.py
.venv/bin/ruff check --no-cache \
  src/sense_engine/memory/state_memory.py tests/memory/test_state_memory.py
```

Expected: tests pass, mypy reports no issues, and Ruff reports `All checks passed!`.

- [ ] **Step 6: Commit the memory service**

```bash
git add src/sense_engine/memory/state_memory.py tests/memory/test_state_memory.py
git commit -m "feat: add in-process state memory baseline"
```

### Task 2: InterventionPolicy runtime service

**Files:**
- Create: `src/sense_engine/policy/intervention_policy.py`
- Create: `tests/policy/test_intervention_policy.py`

- [ ] **Step 1: Write all failing policy tests**

Create `tests/policy/test_intervention_policy.py`:

```python
"""Tests for calm, uncertainty-aware intervention decisions."""

from sense_engine.core.models.intervention import Intervention, RiskLevel
from sense_engine.core.models.state_estimate import StateEstimate
from sense_engine.policy.intervention_policy import InterventionPolicy


def make_estimate(
    *,
    cognitive_load: float | None,
    confidence: float,
) -> StateEstimate:
    """Build a state estimate for policy rule tests."""
    dimensions = (
        {"cognitive_load": cognitive_load}
        if cognitive_load is not None
        else {"engagement": 0.5}
    )
    return StateEstimate(
        dimensions=dimensions,
        distribution={"flow": 0.5, "unknown": 0.5},
        confidence=confidence,
        missingness={},
        model_version="policy-test-v0.1",
        explanation=("Synthetic estimate for policy tests.",),
    )


def test_low_confidence_returns_complete_ask_intervention() -> None:
    intervention = InterventionPolicy().decide_action(
        make_estimate(cognitive_load=0.9, confidence=0.49),
        baseline=0.5,
    )

    assert isinstance(intervention, Intervention)
    assert intervention.objective == "confirm-current-state"
    assert intervention.action.type == "Ask"
    assert intervention.action.channel == "user-prompt"
    assert intervention.action.parameters == {}
    assert intervention.risk.level is RiskLevel.LOW
    assert intervention.risk.rationale == "系统不确定当前状态，需要用户确认"
    assert intervention.reversibility.is_reversible is True
    assert intervention.reversibility.method == "dismiss-prompt"
    assert intervention.reversibility.recovery_seconds == 0.0
    assert intervention.expected_effect == {"cognitive_load": 0.0}


def test_overload_returns_complete_suggest_break_intervention() -> None:
    intervention = InterventionPolicy().decide_action(
        make_estimate(cognitive_load=0.71, confidence=0.7),
        baseline=0.5,
    )

    assert intervention.objective == "reduce-cognitive-load"
    assert intervention.action.type == "Suggest Break"
    assert intervention.action.channel == "recommendation"
    assert intervention.action.parameters == {}
    assert intervention.risk.level is RiskLevel.LOW
    assert intervention.risk.rationale == "认知负荷显著高于个人基线，建议休息"
    assert intervention.reversibility.is_reversible is True
    assert intervention.reversibility.method == "dismiss-suggestion"
    assert intervention.reversibility.recovery_seconds == 0.0
    assert intervention.expected_effect == {"cognitive_load": -0.2}


def test_normal_state_returns_complete_silence_intervention() -> None:
    intervention = InterventionPolicy().decide_action(
        make_estimate(cognitive_load=0.7, confidence=0.9),
        baseline=0.5,
    )

    assert intervention.objective == "preserve-focus"
    assert intervention.action.type == "Silence"
    assert intervention.action.channel == "none"
    assert intervention.action.parameters == {}
    assert intervention.risk.level is RiskLevel.LOW
    assert intervention.risk.rationale == "状态良好，保持安静"
    assert intervention.reversibility.is_reversible is True
    assert intervention.reversibility.method == "no-action-required"
    assert intervention.reversibility.recovery_seconds == 0.0
    assert intervention.expected_effect == {"cognitive_load": 0.0}


def test_low_confidence_ask_has_priority_over_high_load() -> None:
    intervention = InterventionPolicy().decide_action(
        make_estimate(cognitive_load=1.0, confidence=0.4),
        baseline=0.5,
    )

    assert intervention.action.type == "Ask"


def test_missing_cognitive_load_keeps_policy_silent() -> None:
    intervention = InterventionPolicy().decide_action(
        make_estimate(cognitive_load=None, confidence=0.9),
        baseline=0.5,
    )

    assert intervention.action.type == "Silence"
```

- [ ] **Step 2: Run policy tests and verify RED**

Run:

```bash
PYTHONDONTWRITEBYTECODE=1 .venv/bin/pytest -p no:cacheprovider \
  tests/policy/test_intervention_policy.py -v
```

Expected: test collection fails with `ModuleNotFoundError: No module named 'sense_engine.policy.intervention_policy'`.

- [ ] **Step 3: Implement the minimal policy and contract mapping**

Create `src/sense_engine/policy/intervention_policy.py`:

```python
"""Calm, uncertainty-aware intervention policy decisions."""

from dataclasses import dataclass
from math import isfinite
from typing import Final

from sense_engine.core.models.intervention import (
    ActionSpec,
    Intervention,
    Reversibility,
    RiskAssessment,
    RiskLevel,
)
from sense_engine.core.models.state_estimate import StateEstimate


@dataclass(frozen=True, slots=True)
class _DecisionSpec:
    """Map one policy decision to the complete intervention contract."""

    objective: str
    action_type: str
    channel: str
    rationale: str
    reversibility_method: str
    cognitive_load_effect: float


ASK: Final = _DecisionSpec(
    objective="confirm-current-state",
    action_type="Ask",
    channel="user-prompt",
    rationale="系统不确定当前状态，需要用户确认",
    reversibility_method="dismiss-prompt",
    cognitive_load_effect=0.0,
)
SUGGEST_BREAK: Final = _DecisionSpec(
    objective="reduce-cognitive-load",
    action_type="Suggest Break",
    channel="recommendation",
    rationale="认知负荷显著高于个人基线，建议休息",
    reversibility_method="dismiss-suggestion",
    cognitive_load_effect=-0.2,
)
SILENCE: Final = _DecisionSpec(
    objective="preserve-focus",
    action_type="Silence",
    channel="none",
    rationale="状态良好，保持安静",
    reversibility_method="no-action-required",
    cognitive_load_effect=0.0,
)


class InterventionPolicy:
    """Choose a restrained declarative intervention from state evidence."""

    def decide_action(
        self,
        estimate: StateEstimate,
        baseline: float,
    ) -> Intervention:
        """Apply policy priority and return a complete intervention contract."""
        if estimate.confidence < 0.5:
            decision = ASK
        elif self._is_overload(estimate, baseline):
            decision = SUGGEST_BREAK
        else:
            decision = SILENCE
        return self._build_intervention(decision)

    @staticmethod
    def _is_overload(estimate: StateEstimate, baseline: float) -> bool:
        value: object = estimate.dimensions.get("cognitive_load")
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return False
        cognitive_load = float(value)
        return (
            isfinite(cognitive_load)
            and cognitive_load > baseline + 0.2
            and estimate.confidence >= 0.7
        )

    @staticmethod
    def _build_intervention(decision: _DecisionSpec) -> Intervention:
        return Intervention(
            objective=decision.objective,
            action=ActionSpec(
                type=decision.action_type,
                channel=decision.channel,
                parameters={},
            ),
            risk=RiskAssessment(
                level=RiskLevel.LOW,
                rationale=decision.rationale,
            ),
            reversibility=Reversibility(
                is_reversible=True,
                method=decision.reversibility_method,
                recovery_seconds=0.0,
            ),
            expected_effect={
                "cognitive_load": decision.cognitive_load_effect,
            },
        )
```

- [ ] **Step 4: Run policy tests and verify GREEN**

Run:

```bash
PYTHONDONTWRITEBYTECODE=1 .venv/bin/pytest -p no:cacheprovider \
  tests/policy/test_intervention_policy.py -v
```

Expected: all five policy tests pass, including full Ask, Suggest Break, and Silence mappings plus priority conflict and missing-load fallback.

- [ ] **Step 5: Refactor while policy tests stay green**

Review that `_DecisionSpec` is the single mapping source and `_build_intervention()` is the single contract-construction point. Confirm there is no action dispatch, notification code, persistence, API import, or core-contract modification. Do not add a generic policy framework or configurable thresholds in this version.

Run:

```bash
PYTHONDONTWRITEBYTECODE=1 .venv/bin/pytest -p no:cacheprovider \
  tests/policy/test_intervention_policy.py -q
.venv/bin/mypy --cache-dir=/tmp/senseengine-policy-mypy \
  src/sense_engine/policy/intervention_policy.py \
  tests/policy/test_intervention_policy.py
.venv/bin/ruff check --no-cache \
  src/sense_engine/policy/intervention_policy.py \
  tests/policy/test_intervention_policy.py
```

Expected: tests pass, mypy reports no issues, and Ruff reports `All checks passed!`.

- [ ] **Step 6: Commit the policy service**

```bash
git add src/sense_engine/policy/intervention_policy.py \
  tests/policy/test_intervention_policy.py
git commit -m "feat: add calm intervention policy"
```

### Task 3: Full verification and scope audit

**Files:**
- Verify: `src/sense_engine/memory/state_memory.py`
- Verify: `src/sense_engine/policy/intervention_policy.py`
- Verify: `tests/memory/test_state_memory.py`
- Verify: `tests/policy/test_intervention_policy.py`
- Verify unchanged: `src/sense_engine/core/models/`

- [ ] **Step 1: Run complete regression tests without project caches**

```bash
PYTHONDONTWRITEBYTECODE=1 .venv/bin/pytest -p no:cacheprovider -q
```

Expected: all pre-existing 263 tests and all 17 new memory/policy cases pass.

- [ ] **Step 2: Run strict type and lint checks**

```bash
.venv/bin/mypy --cache-dir=/tmp/senseengine-stage-four-mypy src tests
.venv/bin/ruff check --no-cache .
```

Expected: mypy reports no issues and Ruff reports `All checks passed!`.

- [ ] **Step 3: Audit contract and scope boundaries**

```bash
git diff --name-status main...HEAD
git diff --exit-code main...HEAD -- src/sense_engine/core/models
rg -n 'sqlite|sqlalchemy|database|persist|APIRouter|FastAPI\(|requests|httpx|notify|dispatch' \
  src/sense_engine/memory/state_memory.py \
  src/sense_engine/policy/intervention_policy.py
git status --short --branch
```

Expected: the feature diff contains only the two runtime services and their tests; core model diff is empty; the forbidden-scope search has no matches; the feature worktree is clean.
