"""Runnable integration demo for the SenseEngine state loop."""

import json
from collections.abc import Callable
from dataclasses import asdict, dataclass
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
            raise ValueError(f"unsupported computer_activity: {event.computer_activity!r}")
        activity_name = self._activity_name(event)
        meeting_minutes = self._meeting_minutes(event)
        captured_at = self._clock()
        preset = ACTIVITY_PRESETS[event.computer_activity]
        signal_events = [] if preset is None else [self._signal_event(preset, captured_at)]
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
