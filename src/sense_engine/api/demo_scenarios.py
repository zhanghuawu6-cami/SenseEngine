"""Fixed evidence inputs for the public SenseEngine demo sequence."""

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import cast

from sense_engine.api.schemas import DemoEvidence, DemoScenario
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


@dataclass(frozen=True, slots=True)
class DemoScenarioInput:
    """Pair one fixed public scenario with only its estimator inputs."""

    scenario: DemoScenario
    signal_events: tuple[SignalEvent, ...]
    context: ContextSnapshot


def _computer_activity_event(
    now: datetime,
    typing_speed: str,
    mouse_frequency: str,
) -> SignalEvent:
    """Build one deterministic computer activity event for the web demo."""
    return SignalEvent(
        time=now,
        source=SignalSource(
            adapter="web_demo",
            device_id="fixed-demo-device",
            modality="computer_activity",
        ),
        feature=FeaturePayload(
            name="computer_activity_snapshot",
            value=cast(
                FiniteJsonValue,
                {
                    "schema_version": "1.0",
                    "active_window": "VS Code",
                    "typing_speed": typing_speed,
                    "mouse_movement_frequency": mouse_frequency,
                },
            ),
            unit=None,
        ),
        quality=SignalQuality(
            score=1.0,
            completeness=1.0,
            reason="fixed_demo_signal",
        ),
        consent_scope=ConsentScope(
            purposes=("state_estimation",),
            granted_at=now,
        ),
        retention=RetentionPolicy(
            tier=RetentionTier.SESSION,
            on_expiry=ExpiryAction.DELETE,
        ),
    )


def build_demo_scenarios(now: datetime) -> tuple[DemoScenarioInput, ...]:
    """Return the exact ordered three-scenario demo evidence sequence."""
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("demo clock must be timezone-aware")

    empty_context = ContextSnapshot(
        activity=None,
        place=None,
        calendar=(),
        people=None,
        environment=None,
    )
    return (
        DemoScenarioInput(
            scenario=DemoScenario(
                id="insufficient-evidence",
                sequence=1,
                title="证据不足",
                description="可用证据不足，系统应保留不确定性。",
                evidence=(
                    DemoEvidence(label="电脑活动", value="未提供"),
                    DemoEvidence(label="日历上下文", value="未提供"),
                ),
            ),
            signal_events=(),
            context=empty_context,
        ),
        DemoScenarioInput(
            scenario=DemoScenario(
                id="long-meeting",
                sequence=2,
                title="长时间会议",
                description="会议已持续 90 分钟，系统应识别持续占用带来的负荷。",
                evidence=(
                    DemoEvidence(
                        label="电脑活动",
                        value="中等打字速度、中等鼠标移动频率",
                    ),
                    DemoEvidence(label="活动上下文", value="会议"),
                    DemoEvidence(label="日历上下文", value="忙碌 90 分钟"),
                ),
            ),
            signal_events=(
                _computer_activity_event(
                    now,
                    typing_speed="Moderate",
                    mouse_frequency="Moderate",
                ),
            ),
            context=ContextSnapshot(
                activity=ActivityContext(
                    name="Meeting",
                    confidence=1.0,
                    source="fixed_demo",
                ),
                place=None,
                calendar=(
                    CalendarContext(
                        event_type="Meeting",
                        starts_at=now - timedelta(minutes=90),
                        ends_at=now,
                        busy=True,
                    ),
                ),
                people=None,
                environment=None,
            ),
        ),
        DemoScenarioInput(
            scenario=DemoScenario(
                id="deep-focus",
                sequence=3,
                title="深度专注",
                description="高打字速度与低鼠标移动频率共同构成深度专注证据。",
                evidence=(
                    DemoEvidence(
                        label="电脑活动",
                        value="高打字速度、低鼠标移动频率",
                    ),
                    DemoEvidence(label="日历上下文", value="未提供"),
                ),
            ),
            signal_events=(
                _computer_activity_event(
                    now,
                    typing_speed="High",
                    mouse_frequency="Low",
                ),
            ),
            context=empty_context,
        ),
    )
