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
