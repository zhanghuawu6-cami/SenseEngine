"""Integration tests for the SenseEngine state-loop demo."""

import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import pytest

from sense_engine.core.state_estimator import StateEstimator
from sense_engine.memory.state_memory import StateMemoryBank
from sense_engine.policy.intervention_policy import InterventionPolicy

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

from examples.state_loop_demo import (  # noqa: E402
    SenseEngine,
    StateEvent,
    StatePerceptor,
)

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
