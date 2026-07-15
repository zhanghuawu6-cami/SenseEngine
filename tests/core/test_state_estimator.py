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

    assert estimate.distribution["unknown"] == pytest.approx(0.40)
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

    assert estimate.distribution["unknown"] == pytest.approx(0.40)
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
