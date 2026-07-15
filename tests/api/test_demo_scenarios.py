"""Tests for the fixed SenseEngine demo scenario evidence inputs."""

from dataclasses import FrozenInstanceError
from datetime import UTC, datetime, timedelta

import pytest

from sense_engine.api.demo_scenarios import DemoScenarioInput, build_demo_scenarios
from sense_engine.api.schemas import DemoEvidence
from sense_engine.core.models.context_snapshot import ContextSnapshot
from sense_engine.core.models.signal_event import ExpiryAction, RetentionTier

NOW = datetime(2026, 7, 15, 8, 0, tzinfo=UTC)


def empty_context() -> ContextSnapshot:
    """Build the explicit absence of all supported context evidence."""
    return ContextSnapshot(
        activity=None,
        place=None,
        calendar=(),
        people=None,
        environment=None,
    )


def test_scenarios_use_the_fixed_order_and_chinese_copy() -> None:
    scenarios = build_demo_scenarios(NOW)

    assert tuple((item.scenario.id, item.scenario.sequence) for item in scenarios) == (
        ("insufficient-evidence", 1),
        ("long-meeting", 2),
        ("deep-focus", 3),
    )
    assert tuple(
        (
            item.scenario.title,
            item.scenario.description,
            item.scenario.evidence,
        )
        for item in scenarios
    ) == (
        (
            "证据不足",
            "可用证据不足，系统应保留不确定性。",
            (
                DemoEvidence(label="电脑活动", value="未提供"),
                DemoEvidence(label="日历上下文", value="未提供"),
            ),
        ),
        (
            "长时间会议",
            "会议已持续 90 分钟，系统应识别持续占用带来的负荷。",
            (
                DemoEvidence(label="电脑活动", value="中等打字速度、中等鼠标移动频率"),
                DemoEvidence(label="活动上下文", value="会议"),
                DemoEvidence(label="日历上下文", value="忙碌 90 分钟"),
            ),
        ),
        (
            "深度专注",
            "高打字速度与低鼠标移动频率共同构成深度专注证据。",
            (
                DemoEvidence(label="电脑活动", value="高打字速度、低鼠标移动频率"),
                DemoEvidence(label="日历上下文", value="未提供"),
            ),
        ),
    )


def test_insufficient_evidence_has_no_signal_or_context() -> None:
    scenario = build_demo_scenarios(NOW)[0]

    assert scenario.signal_events == ()
    assert scenario.context == empty_context()
    assert scenario.scenario.evidence == (
        DemoEvidence(label="电脑活动", value="未提供"),
        DemoEvidence(label="日历上下文", value="未提供"),
    )


def test_long_meeting_uses_one_neutral_signal_and_a_past_90_minute_window() -> None:
    scenario = build_demo_scenarios(NOW)[1]

    assert len(scenario.signal_events) == 1
    event = scenario.signal_events[0]
    assert event.feature.name == "computer_activity_snapshot"
    assert isinstance(event.feature.value, dict)
    assert event.feature.value["typing_speed"] == "Moderate"
    assert event.feature.value["mouse_movement_frequency"] == "Moderate"
    assert event.time == NOW

    assert scenario.context.activity is not None
    assert scenario.context.activity.name == "Meeting"
    assert scenario.context.activity.confidence == 1.0
    assert scenario.context.activity.source == "fixed_demo"
    assert len(scenario.context.calendar) == 1
    meeting = scenario.context.calendar[0]
    assert meeting.event_type == "Meeting"
    assert meeting.starts_at == NOW - timedelta(minutes=90)
    assert meeting.ends_at == NOW
    assert meeting.ends_at - meeting.starts_at == timedelta(minutes=90)
    assert meeting.busy is True
    assert scenario.context.place is None
    assert scenario.context.people is None
    assert scenario.context.environment is None


@pytest.mark.parametrize(
    ("scenario_index", "typing_speed", "mouse_frequency"),
    [(1, "Moderate", "Moderate"), (2, "High", "Low")],
    ids=["long-meeting", "deep-focus"],
)
def test_computer_signal_uses_fixed_contract_metadata(
    scenario_index: int,
    typing_speed: str,
    mouse_frequency: str,
) -> None:
    event = build_demo_scenarios(NOW)[scenario_index].signal_events[0]

    assert event.time == NOW
    assert event.source.adapter == "web_demo"
    assert event.source.device_id == "fixed-demo-device"
    assert event.source.modality == "computer_activity"
    assert event.feature.name == "computer_activity_snapshot"
    assert event.feature.unit is None
    assert event.feature.value == {
        "schema_version": "1.0",
        "active_window": "VS Code",
        "typing_speed": typing_speed,
        "mouse_movement_frequency": mouse_frequency,
    }
    assert event.quality.score == 1.0
    assert event.quality.completeness == 1.0
    assert event.quality.reason == "fixed_demo_signal"
    assert event.consent_scope.purposes == ("state_estimation",)
    assert event.consent_scope.granted_at == NOW
    assert event.consent_scope.expires_at is None
    assert event.retention.tier is RetentionTier.SESSION
    assert event.retention.expires_at is None
    assert event.retention.on_expiry is ExpiryAction.DELETE


def test_deep_focus_uses_one_high_low_signal_and_empty_context() -> None:
    scenario = build_demo_scenarios(NOW)[2]

    assert len(scenario.signal_events) == 1
    event = scenario.signal_events[0]
    assert event.feature.name == "computer_activity_snapshot"
    assert isinstance(event.feature.value, dict)
    assert event.feature.value["typing_speed"] == "High"
    assert event.feature.value["mouse_movement_frequency"] == "Low"
    assert scenario.context == empty_context()


def test_scenario_inputs_are_frozen_and_slotted() -> None:
    scenario = build_demo_scenarios(NOW)[0]

    assert isinstance(scenario, DemoScenarioInput)
    assert not hasattr(scenario, "__dict__")
    with pytest.raises(FrozenInstanceError):
        setattr(scenario, "signal_events", ())  # noqa: B010 - exercise the runtime guard


def test_naive_demo_clock_is_rejected() -> None:
    with pytest.raises(ValueError, match="^demo clock must be timezone-aware$"):
        build_demo_scenarios(datetime(2026, 7, 15, 8, 0))
