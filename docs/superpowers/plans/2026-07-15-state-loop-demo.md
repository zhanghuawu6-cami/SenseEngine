# SenseEngine State Loop Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a directly runnable, observable SenseEngine state-loop demo that integrates perception adapters, inference, memory, and policy while leaving `src/` unchanged.

**Architecture:** A single example module owns demo-only `StateEvent`, `StatePerceptor`, `RealTimeClock`, `RunTrace`, and `SenseEngine` types. The engine computes the historical baseline before saving the current estimate, preserves the required `run_once() -> Intervention` return type, and exposes intermediate state through a read-only last trace; a second TDD cycle adds deterministic CLI scenarios and JSON logs.

**Tech Stack:** Python 3.11+, dataclasses, existing Pydantic v2 contracts, pytest, subprocess, mypy strict, Ruff

---

### Task 1: Demo adapters and SenseEngine integration

**Files:**
- Create: `examples/state_loop_demo.py`
- Create: `tests/examples/test_state_loop_demo.py`

- [ ] **Step 1: Write failing integration and validation tests**

Create `tests/examples/test_state_loop_demo.py`:

```python
"""Integration tests for the SenseEngine state-loop demo."""

from dataclasses import dataclass
from datetime import UTC, datetime

import pytest

from examples.state_loop_demo import (
    SenseEngine,
    StateEvent,
    StatePerceptor,
)
from sense_engine.core.state_estimator import StateEstimator
from sense_engine.memory.state_memory import StateMemoryBank
from sense_engine.policy.intervention_policy import InterventionPolicy

NOW = datetime(2026, 7, 15, 14, 0, tzinfo=UTC)


@dataclass
class FakeClock:
    """Return one deterministic timezone-aware time."""

    current: datetime = NOW

    def __call__(self) -> datetime:
        return self.current


def make_engine(clock: FakeClock) -> SenseEngine:
    """Build the four-component loop with one shared test clock."""
    return SenseEngine(
        StatePerceptor(clock=clock),
        StateEstimator(),
        StateMemoryBank(clock=clock),
        InterventionPolicy(),
        clock=clock,
    )


def test_last_trace_is_none_before_first_run() -> None:
    engine = make_engine(FakeClock())

    assert engine.last_trace is None


def test_state_loop_produces_all_actions_with_pre_write_baselines() -> None:
    engine = make_engine(FakeClock())
    events = (
        StateEvent(
            scenario_description="Insufficient evidence",
            computer_activity="unknown",
            context_evidence={},
        ),
        StateEvent(
            scenario_description="Long meeting overload",
            computer_activity="neutral",
            context_evidence={"activity": "Meeting", "meeting_minutes": 90},
        ),
        StateEvent(
            scenario_description="Focused work after meeting",
            computer_activity="flow",
            context_evidence={},
        ),
    )
    actions: list[str] = []
    baselines: list[float] = []
    cognitive_loads: list[float] = []

    for event in events:
        intervention = engine.run_once(event)
        trace = engine.last_trace

        assert trace is not None
        actions.append(intervention.action.type)
        baselines.append(trace.baseline)
        cognitive_loads.append(trace.estimate.dimensions["cognitive_load"])

    assert actions == ["Ask", "Suggest Break", "Silence"]
    assert baselines == pytest.approx([0.5, 0.5, 0.7])
    assert cognitive_loads == pytest.approx([0.5, 0.9, 0.55])


@pytest.mark.parametrize(
    ("event", "message"),
    [
        (
            StateEvent("Unsupported preset", "gaming", {}),
            "unsupported computer_activity",
        ),
        (
            StateEvent("Invalid activity", "neutral", {"activity": 42}),
            "activity must be a string",
        ),
        (
            StateEvent("Boolean duration", "neutral", {"meeting_minutes": True}),
            "meeting_minutes must be a finite positive number",
        ),
        (
            StateEvent("String duration", "neutral", {"meeting_minutes": "90"}),
            "meeting_minutes must be a finite positive number",
        ),
        (
            StateEvent("Zero duration", "neutral", {"meeting_minutes": 0}),
            "meeting_minutes must be a finite positive number",
        ),
        (
            StateEvent(
                "Infinite duration",
                "neutral",
                {"meeting_minutes": float("inf")},
            ),
            "meeting_minutes must be a finite positive number",
        ),
    ],
    ids=[
        "activity-preset",
        "activity-type",
        "boolean-duration",
        "string-duration",
        "zero-duration",
        "infinite-duration",
    ],
)
def test_perceptor_rejects_invalid_demo_evidence(
    event: StateEvent,
    message: str,
) -> None:
    perceptor = StatePerceptor(clock=FakeClock())

    with pytest.raises(ValueError, match=message):
        perceptor.perceive(event)
```

- [ ] **Step 2: Run integration tests and verify RED**

Run:

```bash
PYTHONDONTWRITEBYTECODE=1 .venv/bin/pytest -p no:cacheprovider \
  tests/examples/test_state_loop_demo.py -v
```

Expected: collection fails because `examples.state_loop_demo` does not exist. No production or example implementation exists before this failure is observed.

- [ ] **Step 3: Implement demo types, perception, and the engine loop**

Create `examples/state_loop_demo.py`:

```python
"""Runnable integration demo for the SenseEngine state loop."""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from math import isfinite
from typing import Final, TypeAlias, TypedDict, cast

from sense_engine.core.models.common import FiniteJsonValue
from sense_engine.core.models.context_snapshot import (
    ActivityContext,
    CalendarContext,
    ContextSnapshot,
)
from sense_engine.core.models.intervention import Intervention
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
from sense_engine.core.state_estimator import StateEstimator
from sense_engine.memory.state_memory import StateMemoryBank
from sense_engine.policy.intervention_policy import InterventionPolicy

Clock = Callable[[], datetime]
ContextEvidenceValue: TypeAlias = str | float | int | bool | None
ActivityPreset: TypeAlias = tuple[str, str] | None

ACTIVITY_PRESETS: Final[dict[str, ActivityPreset]] = {
    "unknown": None,
    "neutral": ("Moderate", "Moderate"),
    "flow": ("High", "Low"),
    "friction": ("Low", "High"),
}


class _ComputerActivityValue(TypedDict):
    """Describe the composite signal consumed by StateEstimator."""

    schema_version: str
    active_window: str
    typing_speed: str
    mouse_movement_frequency: str


@dataclass(frozen=True, slots=True)
class StateEvent:
    """Describe one deterministic user scenario in the simulated world."""

    scenario_description: str
    computer_activity: str
    context_evidence: dict[str, ContextEvidenceValue]


class RealTimeClock:
    """Return timezone-aware UTC wall-clock values."""

    def __call__(self) -> datetime:
        return datetime.now(tz=UTC)


class StatePerceptor:
    """Adapt a demo StateEvent to existing SenseEngine input contracts."""

    def __init__(self, *, clock: Clock) -> None:
        self._clock = clock

    def perceive(
        self,
        event: StateEvent,
    ) -> tuple[list[SignalEvent], ContextSnapshot]:
        """Validate and convert one simulated event to estimator evidence."""
        if event.computer_activity not in ACTIVITY_PRESETS:
            raise ValueError(
                f"unsupported computer_activity: {event.computer_activity!r}"
            )
        activity_name = self._activity_name(event)
        meeting_minutes = self._meeting_minutes(event)
        captured_at = self._clock()
        preset = ACTIVITY_PRESETS[event.computer_activity]
        signal_events = (
            []
            if preset is None
            else [self._signal_event(preset, captured_at)]
        )
        context = self._context_snapshot(
            activity_name=activity_name,
            meeting_minutes=meeting_minutes,
            captured_at=captured_at,
        )
        return signal_events, context

    @staticmethod
    def _activity_name(event: StateEvent) -> str | None:
        if "activity" not in event.context_evidence:
            return None
        value = event.context_evidence["activity"]
        if not isinstance(value, str):
            raise ValueError("activity must be a string")
        return value

    @staticmethod
    def _meeting_minutes(event: StateEvent) -> float | None:
        if "meeting_minutes" not in event.context_evidence:
            return None
        value = event.context_evidence["meeting_minutes"]
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError("meeting_minutes must be a finite positive number")
        minutes = float(value)
        if not isfinite(minutes) or minutes <= 0.0:
            raise ValueError("meeting_minutes must be a finite positive number")
        return minutes

    @staticmethod
    def _signal_event(
        preset: tuple[str, str],
        captured_at: datetime,
    ) -> SignalEvent:
        typing_speed, mouse_frequency = preset
        value: _ComputerActivityValue = {
            "schema_version": "1.0",
            "active_window": "VS Code",
            "typing_speed": typing_speed,
            "mouse_movement_frequency": mouse_frequency,
        }
        return SignalEvent(
            time=captured_at,
            source=SignalSource(
                adapter="state_loop_demo",
                device_id="demo-device",
                modality="computer_activity",
            ),
            feature=FeaturePayload(
                name="computer_activity_snapshot",
                value=cast(FiniteJsonValue, value),
                unit=None,
            ),
            quality=SignalQuality(
                score=1.0,
                completeness=1.0,
                reason="deterministic_demo_signal",
            ),
            consent_scope=ConsentScope(
                purposes=("state_estimation",),
                granted_at=captured_at,
            ),
            retention=RetentionPolicy(
                tier=RetentionTier.SESSION,
                on_expiry=ExpiryAction.DELETE,
            ),
        )

    @staticmethod
    def _context_snapshot(
        *,
        activity_name: str | None,
        meeting_minutes: float | None,
        captured_at: datetime,
    ) -> ContextSnapshot:
        activity = (
            ActivityContext(
                name=activity_name,
                confidence=1.0,
                source="state-loop-demo",
            )
            if activity_name is not None
            else None
        )
        calendar = (
            (
                CalendarContext(
                    event_type="Meeting",
                    starts_at=captured_at - timedelta(minutes=meeting_minutes),
                    ends_at=captured_at,
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


@dataclass(frozen=True, slots=True)
class RunTrace:
    """Expose one loop's intermediate state for demo observability."""

    run_at: datetime
    baseline: float
    estimate: StateEstimate


class SenseEngine:
    """Coordinate perception, estimation, memory, and policy once."""

    def __init__(
        self,
        perceptor: StatePerceptor,
        estimator: StateEstimator,
        memory_bank: StateMemoryBank,
        policy: InterventionPolicy,
        *,
        clock: Clock | None = None,
    ) -> None:
        self._perceptor = perceptor
        self._estimator = estimator
        self._memory_bank = memory_bank
        self._policy = policy
        self._clock = clock if clock is not None else RealTimeClock()
        self._last_trace: RunTrace | None = None

    @property
    def last_trace(self) -> RunTrace | None:
        """Return the most recent successful loop trace, if one exists."""
        return self._last_trace

    def run_once(self, event: StateEvent) -> Intervention:
        """Run one complete state-estimation and intervention cycle."""
        run_at = self._clock()
        signal_events, context = self._perceptor.perceive(event)
        estimate = self._estimator.estimate(signal_events, context)
        baseline = self._memory_bank.get_baseline()
        self._memory_bank.save_event(estimate)
        intervention = self._policy.decide_action(estimate, baseline)
        self._last_trace = RunTrace(
            run_at=run_at,
            baseline=baseline,
            estimate=estimate,
        )
        return intervention
```

- [ ] **Step 4: Run integration tests and verify GREEN**

Run:

```bash
PYTHONDONTWRITEBYTECODE=1 .venv/bin/pytest -p no:cacheprovider \
  tests/examples/test_state_loop_demo.py -v
```

Expected: all eight collected cases pass: initial trace, three-action loop, and six invalid-evidence cases.

- [ ] **Step 5: Refactor and run focused static checks**

Confirm that all simulation behavior remains in `examples/`, the estimator receives only existing core contracts, baseline reads precede writes, and `run_once()` returns only `Intervention`. Keep validation helpers and contract builders focused; do not add a generic event framework or modify `src/`.

Run:

```bash
PYTHONDONTWRITEBYTECODE=1 .venv/bin/pytest -p no:cacheprovider \
  tests/examples/test_state_loop_demo.py -q
.venv/bin/mypy --cache-dir=/tmp/senseengine-demo-core-mypy \
  examples/state_loop_demo.py tests/examples/test_state_loop_demo.py
.venv/bin/ruff check --no-cache \
  examples/state_loop_demo.py tests/examples/test_state_loop_demo.py
```

Expected: tests pass, mypy reports no issues, and Ruff reports `All checks passed!`.

- [ ] **Step 6: Commit the integrated state loop**

```bash
git add examples/state_loop_demo.py tests/examples/test_state_loop_demo.py
git commit -m "feat: add integrated SenseEngine state loop"
```

### Task 2: Directly runnable CLI demo and structured logs

**Files:**
- Modify: `examples/state_loop_demo.py`
- Modify: `tests/examples/test_state_loop_demo.py`

- [ ] **Step 1: Add a failing subprocess output test**

Add these standard-library imports at the top of `tests/examples/test_state_loop_demo.py`, before the existing `from dataclasses` import:

```python
import subprocess
import sys
```

Add this import after the datetime import:

```python
from pathlib import Path
```

Add the project root constant after `NOW`:

```python
PROJECT_ROOT = Path(__file__).resolve().parents[2]
```

Append this test:

```python
def test_demo_script_runs_and_prints_all_actions() -> None:
    completed = subprocess.run(
        [sys.executable, "examples/state_loop_demo.py"],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )

    assert completed.returncode == 0, completed.stderr
    assert '"type": "Ask"' in completed.stdout
    assert '"type": "Suggest Break"' in completed.stdout
    assert '"type": "Silence"' in completed.stdout
    assert "Historical baseline:" in completed.stdout
    assert "State estimate:" in completed.stdout
    assert "Intervention:" in completed.stdout
```

- [ ] **Step 2: Run only the subprocess test and verify RED**

Run:

```bash
PYTHONDONTWRITEBYTECODE=1 .venv/bin/pytest -p no:cacheprovider \
  tests/examples/test_state_loop_demo.py::test_demo_script_runs_and_prints_all_actions -v
```

Expected: the subprocess exits successfully but the test fails because the module has no `main()` block and prints none of the required action or trace logs.

- [ ] **Step 3: Add deterministic scenarios, JSON logging, and main**

Add `json` before the existing standard-library imports in `examples/state_loop_demo.py`:

```python
import json
```

Change the dataclasses import to:

```python
from dataclasses import asdict, dataclass
```

Append the following after `SenseEngine`:

```python
def build_demo_events() -> tuple[StateEvent, ...]:
    """Return deterministic scenarios for all three intervention outcomes."""
    return (
        StateEvent(
            scenario_description="Low-confidence evidence asks for confirmation",
            computer_activity="unknown",
            context_evidence={},
        ),
        StateEvent(
            scenario_description="A 90-minute meeting exceeds the personal baseline",
            computer_activity="neutral",
            context_evidence={"activity": "Meeting", "meeting_minutes": 90},
        ),
        StateEvent(
            scenario_description="Focused work remains quiet after the meeting",
            computer_activity="flow",
            context_evidence={},
        ),
    )


def _json(value: object) -> str:
    """Render demo values as readable UTF-8 JSON."""
    return json.dumps(value, ensure_ascii=False, indent=2)


def main() -> None:
    """Run and print the deterministic SenseEngine demonstration."""
    clock = RealTimeClock()
    engine = SenseEngine(
        StatePerceptor(clock=clock),
        StateEstimator(),
        StateMemoryBank(clock=clock),
        InterventionPolicy(),
        clock=clock,
    )

    print("SenseEngine State Loop Demo")
    for index, event in enumerate(build_demo_events(), start=1):
        intervention = engine.run_once(event)
        trace = engine.last_trace
        if trace is None:
            raise RuntimeError("successful run did not produce a trace")

        print(f"\n=== Scenario {index}: {event.scenario_description} ===")
        print("Input event:")
        print(_json(asdict(event)))
        print(f"Run time: {trace.run_at.isoformat()}")
        print(f"Historical baseline: {trace.baseline:.2f}")
        print("State estimate:")
        print(_json(trace.estimate.model_dump(mode="json")))
        print("Intervention:")
        print(_json(intervention.model_dump(mode="json")))


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run the subprocess and all example tests and verify GREEN**

Run:

```bash
PYTHONDONTWRITEBYTECODE=1 .venv/bin/pytest -p no:cacheprovider \
  tests/examples/test_state_loop_demo.py -v
```

Expected: all nine example cases pass, including the direct subprocess execution.

- [ ] **Step 5: Run the demo directly and inspect its output**

Run:

```bash
.venv/bin/python examples/state_loop_demo.py
```

Expected: exit code zero and three readable scenario blocks. Their intervention action types appear in this order: Ask, Suggest Break, Silence; historical baselines appear as `0.50`, `0.50`, and `0.70`.

- [ ] **Step 6: Refactor while CLI tests stay green**

Keep `main()` responsible only for wiring and presentation, `_json()` responsible only for rendering, and `build_demo_events()` responsible only for deterministic fixtures. Do not add command-line parsing, external logging libraries, persistence, or production exports.

Run:

```bash
.venv/bin/mypy --cache-dir=/tmp/senseengine-demo-cli-mypy \
  examples/state_loop_demo.py tests/examples/test_state_loop_demo.py
.venv/bin/ruff check --no-cache \
  examples/state_loop_demo.py tests/examples/test_state_loop_demo.py
```

Expected: mypy reports no issues and Ruff reports `All checks passed!`.

- [ ] **Step 7: Commit the runnable CLI demonstration**

```bash
git add examples/state_loop_demo.py tests/examples/test_state_loop_demo.py
git commit -m "feat: add runnable state loop demonstration"
```

### Task 3: Full verification and zero-src audit

**Files:**
- Verify: `examples/state_loop_demo.py`
- Verify: `tests/examples/test_state_loop_demo.py`
- Verify unchanged: `src/`

- [ ] **Step 1: Run the complete test suite without project caches**

```bash
PYTHONDONTWRITEBYTECODE=1 .venv/bin/pytest -p no:cacheprovider -q
```

Expected: all existing 280 tests and all nine new example cases pass.

- [ ] **Step 2: Run complete strict type and lint checks**

```bash
.venv/bin/mypy --cache-dir=/tmp/senseengine-final-demo-mypy \
  src tests examples/state_loop_demo.py
.venv/bin/ruff check --no-cache .
```

Expected: mypy reports no issues and Ruff reports `All checks passed!`.

- [ ] **Step 3: Re-run the direct demo as a release check**

```bash
.venv/bin/python examples/state_loop_demo.py
```

Expected: exit code zero, all three action types, and the three expected pre-write baselines.

- [ ] **Step 4: Audit exact scope and worktree state**

```bash
git diff --name-status main...HEAD
git diff --exit-code main...HEAD -- src
rg -n 'StateValidator|sqlite|sqlalchemy|database|persist|APIRouter|FastAPI\(|requests|httpx|notify|dispatch' \
  examples/state_loop_demo.py
git status --short --branch
```

Expected: the feature diff contains only `examples/state_loop_demo.py` and `tests/examples/test_state_loop_demo.py`; `src/` diff is empty; forbidden-scope search has no matches; the feature worktree is clean.
