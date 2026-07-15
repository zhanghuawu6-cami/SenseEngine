# ComputerActivityAdapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic-testable simulated computer activity adapter that emits one composite `SignalEvent` per capture.

**Architecture:** `ComputerActivityAdapter` owns simulation and conversion because this iteration intentionally excludes a separate processor. It accepts caller-declared consent and retention models, injects an optional random generator and clock, and uses the existing strict `SignalEvent` contract as its output boundary. The composite payload is a versioned `TypedDict` so future computer activity fields can be added deliberately without splitting one physical snapshot into multiple events.

**Tech Stack:** Python 3.11+, Pydantic v2 contracts, pytest, mypy strict, Ruff

---

### Task 1: Composite computer activity event

**Files:**
- Create: `src/sense_engine/adapters/computer_activity.py`
- Create: `tests/adapters/test_computer_activity.py`

- [ ] **Step 1: Write the failing adapter tests**

```python
# tests/adapters/test_computer_activity.py
"""Tests for the simulated computer activity signal adapter."""

import random
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from sense_engine.adapters.computer_activity import ComputerActivityAdapter
from sense_engine.core.models.signal_event import (
    ConsentScope,
    ExpiryAction,
    RetentionPolicy,
    RetentionTier,
    SignalEvent,
)

FIXED_TIME = datetime(2026, 7, 15, 9, 30, tzinfo=UTC)
ACTIVE_WINDOWS = {"VS Code", "Google Chrome", "Terminal", "Figma", "Slack"}
ACTIVITY_LEVELS = {"Low", "Moderate", "High"}


def make_consent_scope() -> ConsentScope:
    """Build caller-declared consent metadata for adapter tests."""
    return ConsentScope(
        purposes=("state_estimation",),
        granted_at=FIXED_TIME,
    )


def make_retention_policy() -> RetentionPolicy:
    """Build caller-declared retention metadata for adapter tests."""
    return RetentionPolicy(
        tier=RetentionTier.SESSION,
        on_expiry=ExpiryAction.DELETE,
    )


def make_adapter(*, clock_time: datetime = FIXED_TIME) -> ComputerActivityAdapter:
    """Build a deterministic adapter for focused tests."""
    return ComputerActivityAdapter(
        device_id="device-pseudonym-001",
        consent_scope=make_consent_scope(),
        retention=make_retention_policy(),
        rng=random.Random(7),
        clock=lambda: clock_time,
    )


def test_capture_activity_returns_one_composite_signal_event() -> None:
    event = make_adapter().capture_activity()

    assert isinstance(event, SignalEvent)
    assert event.feature.name == "computer_activity_snapshot"
    assert event.feature.unit is None
    assert isinstance(event.feature.value, dict)
    assert set(event.feature.value) == {
        "schema_version",
        "active_window",
        "typing_speed",
        "mouse_movement_frequency",
    }
    assert event.feature.value["schema_version"] == "1.0"


def test_capture_activity_uses_only_approved_simulation_values() -> None:
    adapter = make_adapter()

    for _ in range(100):
        value = adapter.capture_activity().feature.value
        assert isinstance(value, dict)
        assert value["active_window"] in ACTIVE_WINDOWS
        assert value["typing_speed"] in ACTIVITY_LEVELS
        assert value["mouse_movement_frequency"] in ACTIVITY_LEVELS


def test_capture_activity_preserves_time_source_quality_and_policy_metadata() -> None:
    consent_scope = make_consent_scope()
    retention = make_retention_policy()
    adapter = ComputerActivityAdapter(
        device_id="device-pseudonym-001",
        consent_scope=consent_scope,
        retention=retention,
        rng=random.Random(7),
        clock=lambda: FIXED_TIME,
    )

    event = adapter.capture_activity()

    assert event.time == FIXED_TIME
    assert event.time.utcoffset() is not None
    assert event.source.adapter == "computer_activity_adapter"
    assert event.source.device_id == "device-pseudonym-001"
    assert event.source.modality == "computer_activity"
    assert event.quality.score == 0.85
    assert event.quality.completeness == 1.0
    assert event.quality.reason == "simulated_complete_snapshot"
    assert event.consent_scope == consent_scope
    assert event.retention == retention


def test_capture_activity_json_round_trip_is_lossless() -> None:
    event = make_adapter().capture_activity()

    assert SignalEvent.model_validate_json(event.model_dump_json()) == event


def test_adapter_rejects_empty_device_identifier() -> None:
    with pytest.raises(ValidationError):
        ComputerActivityAdapter(
            device_id="",
            consent_scope=make_consent_scope(),
            retention=make_retention_policy(),
        )


def test_capture_activity_rejects_naive_clock_time() -> None:
    adapter = make_adapter(clock_time=FIXED_TIME.replace(tzinfo=None))

    with pytest.raises(ValidationError):
        adapter.capture_activity()
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
PYTHONDONTWRITEBYTECODE=1 .venv/bin/pytest -p no:cacheprovider tests/adapters/test_computer_activity.py -v
```

Expected: test collection fails with `ModuleNotFoundError: No module named 'sense_engine.adapters.computer_activity'` because the adapter has not been implemented.

- [ ] **Step 3: Implement the minimal adapter**

```python
# src/sense_engine/adapters/computer_activity.py
"""Simulated computer activity adapter for State Computing signals."""

import random
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Final, TypedDict, cast

from sense_engine.core.models.common import FiniteJsonValue
from sense_engine.core.models.signal_event import (
    ConsentScope,
    FeaturePayload,
    RetentionPolicy,
    SignalEvent,
    SignalQuality,
    SignalSource,
)

SCHEMA_VERSION: Final = "1.0"
ACTIVE_WINDOWS: Final = ("VS Code", "Google Chrome", "Terminal", "Figma", "Slack")
ACTIVITY_LEVELS: Final = ("Low", "Moderate", "High")


class ComputerActivityValue(TypedDict):
    """Versioned composite payload for one computer activity snapshot."""

    schema_version: str
    active_window: str
    typing_speed: str
    mouse_movement_frequency: str


def _utc_now() -> datetime:
    """Return the current timezone-aware UTC time."""
    return datetime.now(tz=UTC)


class ComputerActivityAdapter:
    """Generate simulated computer activity as one time-aligned signal event."""

    def __init__(
        self,
        *,
        device_id: str,
        consent_scope: ConsentScope,
        retention: RetentionPolicy,
        rng: random.Random | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._source = SignalSource(
            adapter="computer_activity_adapter",
            device_id=device_id,
            modality="computer_activity",
        )
        self._consent_scope = consent_scope
        self._retention = retention
        self._rng = rng if rng is not None else random.Random()
        self._clock = clock if clock is not None else _utc_now

    def capture_activity(self) -> SignalEvent:
        """Capture one simulated computer activity snapshot as a composite event."""
        value: ComputerActivityValue = {
            "schema_version": SCHEMA_VERSION,
            "active_window": self._rng.choice(ACTIVE_WINDOWS),
            "typing_speed": self._rng.choice(ACTIVITY_LEVELS),
            "mouse_movement_frequency": self._rng.choice(ACTIVITY_LEVELS),
        }
        return SignalEvent(
            time=self._clock(),
            source=self._source,
            feature=FeaturePayload(
                name="computer_activity_snapshot",
                value=cast(FiniteJsonValue, value),
                unit=None,
            ),
            quality=SignalQuality(
                score=0.85,
                completeness=1.0,
                reason="simulated_complete_snapshot",
            ),
            consent_scope=self._consent_scope,
            retention=self._retention,
        )
```

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```bash
PYTHONDONTWRITEBYTECODE=1 .venv/bin/pytest -p no:cacheprovider tests/adapters/test_computer_activity.py -v
```

Expected: `6 passed`.

- [ ] **Step 5: Commit the tested adapter**

```bash
git add src/sense_engine/adapters/computer_activity.py tests/adapters/test_computer_activity.py
git commit -m "feat: add computer activity signal adapter"
```

### Task 2: Full regression and scope verification

**Files:**
- Verify: `src/sense_engine/adapters/computer_activity.py`
- Verify: `tests/adapters/test_computer_activity.py`

- [ ] **Step 1: Run all tests without creating project caches**

Run:

```bash
PYTHONDONTWRITEBYTECODE=1 .venv/bin/pytest -p no:cacheprovider -q
```

Expected: all existing 241 contract tests plus 6 adapter tests pass.

- [ ] **Step 2: Run strict type and lint checks**

Run:

```bash
.venv/bin/mypy --cache-dir=/tmp/senseengine-computer-adapter-mypy src tests
.venv/bin/ruff check --no-cache .
```

Expected: mypy reports no issues and Ruff reports `All checks passed!`.

- [ ] **Step 3: Verify scope and generated-artifact hygiene**

Run:

```bash
find src/sense_engine/adapters -maxdepth 1 -type f -print | sort
find . -path './.venv' -prune -o -type d \( -name .pytest_cache -o -name .mypy_cache -o -name .ruff_cache -o -name __pycache__ \) -print -o -type f -name '*.pyc' -print
```

Expected: the adapter directory contains only `__init__.py` and `computer_activity.py`; the cache audit prints nothing. No Calendar, SignalProcessor, or StateEstimator file exists.

- [ ] **Step 4: Inspect the final commit scope**

Run:

```bash
git status --short
git show --stat --oneline HEAD
```

Expected: the implementation commit contains only the adapter and its independent test. Pre-existing untracked project files remain uncommitted and unchanged.
