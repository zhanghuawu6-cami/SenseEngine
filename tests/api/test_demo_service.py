"""Tests for isolated orchestration of the fixed SenseEngine demo run."""

from datetime import UTC, datetime, timedelta, timezone

import pytest

from sense_engine.api.demo_service import DemoService
from sense_engine.core.models.context_snapshot import ContextSnapshot
from sense_engine.core.models.signal_event import SignalEvent
from sense_engine.core.models.state_estimate import StateEstimate
from sense_engine.core.state_estimator import StateEstimator

NOW = datetime(2026, 7, 15, 8, 0, tzinfo=UTC)


class CountingEstimator(StateEstimator):
    """Record whether orchestration reached state estimation."""

    def __init__(self) -> None:
        super().__init__()
        self.call_count = 0

    def estimate(
        self,
        signal_events: list[SignalEvent],
        context: ContextSnapshot,
    ) -> StateEstimate:
        self.call_count += 1
        return super().estimate(signal_events, context)


def test_run_orchestrates_fixed_scenarios_with_real_core_components() -> None:
    response = DemoService(clock=lambda: NOW).run()

    assert response.generated_at == NOW
    assert tuple((step.scenario.id, step.scenario.sequence) for step in response.steps) == (
        ("insufficient-evidence", 1),
        ("long-meeting", 2),
        ("deep-focus", 3),
    )
    assert tuple(step.baseline_before for step in response.steps) == pytest.approx(
        (0.5, 0.5, 0.7)
    )
    assert tuple(
        step.estimate.dimensions["cognitive_load"] for step in response.steps
    ) == pytest.approx((0.5, 0.9, 0.55))
    assert tuple(step.estimate.confidence for step in response.steps) == pytest.approx(
        (0.4, 0.8, 0.85)
    )
    assert tuple(step.intervention.action.type for step in response.steps) == (
        "Ask",
        "Suggest Break",
        "Silence",
    )
    assert response.baseline_after == pytest.approx(0.65)


def test_consecutive_runs_do_not_share_memory() -> None:
    service = DemoService(clock=lambda: NOW)

    first = service.run()
    second = service.run()

    assert tuple(step.baseline_before for step in first.steps) == pytest.approx(
        (0.5, 0.5, 0.7)
    )
    assert tuple(step.baseline_before for step in second.steps) == pytest.approx(
        (0.5, 0.5, 0.7)
    )
    assert first.baseline_after == pytest.approx(0.65)
    assert second.baseline_after == pytest.approx(0.65)


def test_run_normalizes_an_aware_non_utc_clock() -> None:
    china_standard_time = timezone(timedelta(hours=8))
    local_now = datetime(2026, 7, 15, 16, 0, tzinfo=china_standard_time)

    response = DemoService(clock=lambda: local_now).run()

    assert response.generated_at == NOW
    assert response.generated_at.tzinfo is UTC


def test_naive_clock_is_rejected_before_orchestration_starts() -> None:
    estimator = CountingEstimator()
    service = DemoService(
        clock=lambda: datetime(2026, 7, 15, 8, 0),
        estimator=estimator,
    )

    with pytest.raises(ValueError, match="^demo clock must be timezone-aware$"):
        service.run()

    assert estimator.call_count == 0
